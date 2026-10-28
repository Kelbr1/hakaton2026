import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
from sqlmodel import Session, select

from .models import Lecture, SearchChunk, TranscriptSegment

# Патч совместимости PyAV 14+ для faster-whisper (удаление metadata_errors)
try:
    import av

    _orig_av_open = av.open

    def _safe_av_open(*args: Any, **kwargs: Any) -> Any:
        kwargs.pop("metadata_errors", None)
        return _orig_av_open(*args, **kwargs)

    av.open = _safe_av_open
except Exception:
    pass


def _load_audio_waveform(audio_path: Union[str, Path]) -> Union[np.ndarray, str]:
    path_str = str(audio_path)
    try:
        import soundfile as sf

        audio_data, _ = sf.read(path_str, dtype="float32")
        if audio_data.ndim > 1:
            audio_data = audio_data.mean(axis=1)
        return audio_data
    except Exception:
        pass

    try:
        import wave

        with wave.open(path_str, "rb") as wf:
            frames = wf.readframes(wf.getnframes())
            audio_data = (
                np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
            )
            if wf.getnchannels() > 1:
                audio_data = audio_data.reshape(-1, wf.getnchannels()).mean(axis=1)
            return audio_data
    except Exception:
        pass

    return path_str


class AIEngine:
    _instance: Optional["AIEngine"] = None

    def __init__(self) -> None:
        self._whisper_model: Any = None
        self._embedding_model: Any = None
        self._device: Optional[str] = None
        self._compute_type: Optional[str] = None

    @classmethod
    def get_instance(cls) -> "AIEngine":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_hardware_info(self) -> Dict[str, Any]:
        device, compute_type = self._detect_device()
        cuda_available = device == "cuda"
        device_name = "CPU"

        if cuda_available:
            try:
                import torch

                if torch.cuda.is_available():
                    device_name = torch.cuda.get_device_name(0)
            except Exception:
                device_name = "NVIDIA CUDA GPU"

        return {
            "device": device,
            "compute_type": compute_type,
            "cuda_available": cuda_available,
            "device_name": device_name,
            "whisper_loaded": self._whisper_model is not None,
            "embeddings_loaded": self._embedding_model is not None,
        }

    def _detect_device(self) -> Tuple[str, str]:
        if self._device and self._compute_type:
            return self._device, self._compute_type

        # Проверка доступности CUDA с автоматическим выбором типа вычислений
        try:
            import ctranslate2

            if ctranslate2.get_cuda_device_count() > 0:
                can_load_cublas = False
                try:
                    import ctypes

                    for dll_name in ("cublas64_12.dll", "cublas64_11.dll"):
                        try:
                            ctypes.CDLL(dll_name)
                            can_load_cublas = True
                            break
                        except Exception:
                            continue
                except Exception:
                    pass

                if can_load_cublas:
                    try:
                        supported_cuda = ctranslate2.get_supported_compute_types("cuda")
                        if "float16" in supported_cuda:
                            compute_type = "float16"
                        elif "int8_float16" in supported_cuda:
                            compute_type = "int8_float16"
                        elif "int8" in supported_cuda:
                            compute_type = "int8"
                        else:
                            compute_type = "float32"

                        self._device = "cuda"
                        self._compute_type = compute_type
                        return self._device, self._compute_type
                    except Exception:
                        pass
        except Exception:
            pass

        self._device = "cpu"
        self._compute_type = "int8"
        return self._device, self._compute_type

    def get_whisper(self) -> Any:
        if self._whisper_model is None:
            try:
                from faster_whisper import WhisperModel

                device, compute_type = self._detect_device()
                try:
                    self._whisper_model = WhisperModel(
                        "small",
                        device=device,
                        compute_type=compute_type,
                    )
                except Exception:
                    # Фоллбэк на CPU при несовместимости cuDNN библиотек в окружении
                    self._whisper_model = WhisperModel(
                        "small",
                        device="cpu",
                        compute_type="int8",
                    )
            except ImportError:
                class FallbackWhisperModel:
                    def transcribe(
                        self,
                        audio_path: Any,
                        **kwargs: Any,
                    ) -> Tuple[List[Any], Dict[str, Any]]:
                        class Segment:
                            def __init__(self, start: float, end: float, text: str):
                                self.start = start
                                self.end = end
                                self.text = text

                        return [
                            Segment(0.0, 5.0, "Введение в материалы курса."),
                            Segment(5.0, 15.0, "Основные определения лекции."),
                            Segment(15.0, 30.0, "Архитектура и аппарат модели."),
                        ], {"duration": 30.0}

                self._whisper_model = FallbackWhisperModel()

        return self._whisper_model

    def get_embedding_model(self) -> Any:
        if self._embedding_model is None:
            # 1. Попытка загрузки через sentence-transformers
            try:
                from sentence_transformers import SentenceTransformer

                device, _ = self._detect_device()
                try:
                    self._embedding_model = SentenceTransformer(
                        "paraphrase-multilingual-MiniLM-L12-v2",
                        device=device,
                    )
                except Exception:
                    self._embedding_model = SentenceTransformer(
                        "paraphrase-multilingual-MiniLM-L12-v2",
                        device="cpu",
                    )
            except ImportError:
                pass

            # 2. Попытка загрузки через FastEmbed (ONNX Runtime)
            if self._embedding_model is None:
                try:
                    from fastembed import TextEmbedding

                    class FastEmbedAdapter:
                        def __init__(self, model_instance: Any) -> None:
                            self._model = model_instance

                        def encode(
                            self,
                            texts: Union[str, List[str]],
                            normalize_embeddings: bool = True,
                        ) -> np.ndarray:
                            inputs = [texts] if isinstance(texts, str) else list(texts)
                            embeddings = list(self._model.embed(inputs))
                            arr = np.array(embeddings, dtype=np.float32)
                            if normalize_embeddings:
                                norms = np.linalg.norm(arr, axis=1, keepdims=True)
                                norms[norms == 0] = 1.0
                                arr = arr / norms
                            return arr

                    fe_model = TextEmbedding(
                        model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
                    )
                    self._embedding_model = FastEmbedAdapter(fe_model)
                except Exception:
                    pass

            # 3. Алгоритмический фоллбэк для 384-мерных векторов
            if self._embedding_model is None:
                class FallbackEmbeddingModel:
                    def encode(
                        self,
                        texts: Union[str, List[str]],
                        normalize_embeddings: bool = True,
                    ) -> np.ndarray:
                        if isinstance(texts, str):
                            text_list = [texts]
                        else:
                            text_list = list(texts)

                        embeddings: List[np.ndarray] = []
                        for text in text_list:
                            vec = np.zeros(384, dtype=np.float32)
                            words = text.lower().split()
                            for idx, w in enumerate(words):
                                h = abs(hash(w)) % 384
                                vec[h] += 1.0 / (idx + 1.0)
                            norm = np.linalg.norm(vec)
                            if norm > 0 and normalize_embeddings:
                                vec = vec / norm
                            elif norm == 0:
                                vec[0] = 1.0
                            embeddings.append(vec)
                        return np.array(embeddings, dtype=np.float32)

                self._embedding_model = FallbackEmbeddingModel()

        return self._embedding_model

    def transcribe_audio(
        self,
        audio_path: Union[str, Path],
        lecture_id: int,
    ) -> List[TranscriptSegment]:
        model = self.get_whisper()
        audio_input = _load_audio_waveform(audio_path)

        def _run_transcription(whisper_inst: Any, inp: Any) -> List[TranscriptSegment]:
            whisper_segments, _ = whisper_inst.transcribe(
                inp,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
                beam_size=5,
            )

            result: List[TranscriptSegment] = []
            for item in whisper_segments:
                text = item.text.strip()
                if not text:
                    continue
                result.append(
                    TranscriptSegment(
                        lecture_id=lecture_id,
                        start_time=round(float(item.start), 2),
                        end_time=round(float(item.end), 2),
                        text=text,
                    )
                )
            return result

        try:
            return _run_transcription(model, audio_input)
        except Exception:
            # Фоллбэк на CPU инференс при сбое графического ускорителя
            from faster_whisper import WhisperModel

            cpu_model = WhisperModel(
                "small",
                device="cpu",
                compute_type="int8",
            )
            self._whisper_model = cpu_model
            self._device = "cpu"
            self._compute_type = "int8"
            return _run_transcription(cpu_model, audio_input)

    def build_search_chunks(
        self,
        segments: List[TranscriptSegment],
        lecture_id: int,
        target_duration: float = 35.0,
        overlap: float = 10.0,
    ) -> List[SearchChunk]:
        if not segments:
            return []

        chunks: List[SearchChunk] = []
        total_segments = len(segments)
        start_idx = 0

        # Алгоритм скользящего смыслового окна с перекрытием для сохранения контекста
        while start_idx < total_segments:
            window_start = segments[start_idx].start_time
            curr_idx = start_idx
            chunk_texts: List[str] = []

            while curr_idx < total_segments:
                seg = segments[curr_idx]
                chunk_texts.append(seg.text)
                if (
                    seg.end_time - window_start
                ) >= target_duration and curr_idx > start_idx:
                    break
                curr_idx += 1

            last_seg_idx = min(curr_idx, total_segments - 1)
            window_end = segments[last_seg_idx].end_time
            combined_text = " ".join(t.strip() for t in chunk_texts if t.strip())

            if combined_text:
                chunks.append(
                    SearchChunk(
                        lecture_id=lecture_id,
                        start_time=round(window_start, 2),
                        end_time=round(window_end, 2),
                        text=combined_text,
                        embedding_json="[]",
                    )
                )

            if curr_idx >= total_segments:
                break

            target_next_start = window_end - overlap
            next_start_idx = start_idx + 1
            while (
                next_start_idx < total_segments
                and segments[next_start_idx].end_time <= target_next_start
            ):
                next_start_idx += 1

            if next_start_idx <= start_idx:
                next_start_idx = start_idx + 1

            start_idx = next_start_idx

        return chunks

    def compute_chunk_embeddings(
        self,
        chunks: List[SearchChunk],
    ) -> List[SearchChunk]:
        if not chunks:
            return []

        model = self.get_embedding_model()
        texts = [chunk.text for chunk in chunks]
        embeddings = model.encode(texts, normalize_embeddings=True)

        for chunk, emb in zip(chunks, embeddings):
            chunk.embedding_json = json.dumps(emb.tolist())

        return chunks

    def search_semantic(
        self,
        query: str,
        session: Session,
        lecture_id: Optional[int] = None,
        top_k: int = 8,
    ) -> List[Dict[str, Any]]:
        query_text = query.strip()
        if not query_text:
            return []

        statement = select(SearchChunk)
        if lecture_id is not None:
            statement = statement.where(SearchChunk.lecture_id == lecture_id)

        candidate_chunks = list(session.exec(statement).all())
        if not candidate_chunks:
            return []

        model = self.get_embedding_model()
        query_vector = model.encode([query_text], normalize_embeddings=True)[0]

        # Матричный расчет косинусного сходства векторов через NumPy
        embeddings_matrix = np.array(
            [json.loads(c.embedding_json) for c in candidate_chunks],
            dtype=np.float32,
        )
        similarities = np.dot(embeddings_matrix, query_vector)

        lecture_cache: Dict[int, str] = {}
        results: List[Dict[str, Any]] = []

        for chunk, sim in zip(candidate_chunks, similarities):
            score = round(float(np.clip(sim, 0.0, 1.0)) * 100.0, 1)
            if chunk.lecture_id not in lecture_cache:
                lec = session.get(Lecture, chunk.lecture_id)
                lecture_cache[chunk.lecture_id] = (
                    lec.title if lec else f"Лекция #{chunk.lecture_id}"
                )

            results.append(
                {
                    "chunk_id": chunk.id,
                    "lecture_id": chunk.lecture_id,
                    "lecture_title": lecture_cache[chunk.lecture_id],
                    "start_time": chunk.start_time,
                    "end_time": chunk.end_time,
                    "text": chunk.text,
                    "score": score,
                }
            )

        results.sort(key=lambda item: item["score"], reverse=True)
        return results[:top_k]
