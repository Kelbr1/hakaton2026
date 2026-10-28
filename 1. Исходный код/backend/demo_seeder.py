import subprocess
import uuid
from pathlib import Path
from typing import List, Tuple

from sqlmodel import Session

from .ai_engine import AIEngine
from .media_utils import AUDIO_DIR, VIDEOS_DIR, get_ffmpeg_path
from .models import GlossaryTerm, Lecture, LectureChapter, TranscriptSegment

DEMO_SUMMARY_MARKDOWN: str = """# Архитектура Трансформеров и механизмы внимания

## Краткое содержание
Фундаментальный академический разбор архитектуры **Transformer**.
В материале детально рассматриваются предпосылки перехода от RNN/LSTM
к параллельным матричным вычислениям, математический аппарат механизма
**Scaled Dot-Product Attention**, структура многоголового внимания
**Multi-Head Attention** и роль позиционного кодирования.

## Ключевые архитектурные узлы
- **Scaled Dot-Product Attention**: скалярное произведение $Q$ и $K^T$,
  нормированное на $\\sqrt{d_k}$ с применением Softmax и умножением на $V$.
- **Multi-Head Attention**: 8 параллельных голов внимания для
  сопоставления связей в разных подпространствах.
- **Positional Encoding**: внедрение информации о порядке токенов через
  гармоники синусов и косинусов.
- **Add & Norm**: остаточные связи (*Residual Connections*) и
  нормализация (*LayerNorm*).

## Выводы и современное развитие
Архитектура Transformer легла в основу всех современных LLM:
GPT-4, LLaMA-3 и Qwen-2.5. Ключевым направлением остается оптимизация
квадратичной сложности $O(N^2)$ для сверхдлинных контекстов.
"""


def _ensure_demo_media_files() -> Tuple[Path, Path]:
    video_path = VIDEOS_DIR / "demo_transformers.mp4"
    audio_path = AUDIO_DIR / "demo_transformers.wav"

    if not video_path.is_file():
        ffmpeg_bin = get_ffmpeg_path()
        # Быстрая генерация темного видеоряда 120 сек с аудио 440Гц
        cmd = [
            ffmpeg_bin,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=0x09090B:s=640x360:d=120",
            "-f",
            "lavfi",
            "-i",
            "sine=f=440:d=120",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-shortest",
            str(video_path),
        ]
        subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )

    if not audio_path.is_file():
        ffmpeg_bin = get_ffmpeg_path()
        audio_cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            str(audio_path),
        ]
        subprocess.run(
            audio_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )

    return video_path, audio_path


def seed_demo_lecture(session: Session) -> Lecture:
    video_path, audio_path = _ensure_demo_media_files()
    uid = uuid.uuid4().hex[:6]

    lecture = Lecture(
        title=f"Архитектура Трансформеров и механизмы внимания ({uid})",
        source_type="file",
        video_path=str(video_path),
        audio_path=str(audio_path),
        duration=120.0,
        status="ready",
        summary_markdown=DEMO_SUMMARY_MARKDOWN,
    )
    session.add(lecture)
    session.commit()
    session.refresh(lecture)

    try:
        from .media_utils import generate_thumbnail
        thumb = generate_thumbnail(video_path, thumbnail_id=f"lec_{lecture.id}", duration=120.0)
        if thumb:
            lecture.thumbnail_path = f"backend/storage/thumbnails/{thumb.name}"
            session.add(lecture)
            session.commit()
    except Exception:
        pass

    raw_segments: List[Tuple[float, float, str]] = [
        (0.0, 6.5, "Здравствуйте! Разберем архитектуру Transformer."),
        (6.5, 14.0, "Статья Attention Is All You Need изменила весь ML."),
        (14.0, 22.0, "До трансформеров стандартом были сети RNN и LSTM."),
        (22.0, 30.5, "Слабость RNN — последовательный расчет без GPU-параллелизма."),
        (30.5, 39.0, "Трансформер заменил рекуррентность механизмом внимания."),
        (39.0, 48.0, "Ключевой узел — Scaled Dot-Product Attention с Q, K, V."),
        (48.0, 58.0, "Внимание считает произведение Q и K^T деленное на sqrt(d_k)."),
        (58.0, 67.5, "Применяется функция Softmax и умножение на матрицу Value."),
        (67.5, 77.0, "Multi-Head Attention связывает токены в подпространствах."),
        (77.0, 86.5, "Positional Encoding задает порядок слов синусами и косинусами."),
        (86.5, 96.0, "В блоках применяются связи Residual Connections и LayerNorm."),
        (96.0, 107.0, "На базе Transformer созданы современные LLM: GPT, LLaMA, Qwen."),
        (107.0, 120.0, "Сложность O(N^2) по длине контекста — ключевой вызов."),
    ]

    segments: List[TranscriptSegment] = []
    for start, end, text in raw_segments:
        seg = TranscriptSegment(
            lecture_id=lecture.id or 0,
            start_time=start,
            end_time=end,
            text=text,
        )
        session.add(seg)
        segments.append(seg)
    session.commit()

    # Построение семантических чанков и расчет 384D векторов
    ai_engine = AIEngine.get_instance()
    chunks = ai_engine.build_search_chunks(
        segments=segments,
        lecture_id=lecture.id or 0,
        target_duration=35.0,
        overlap=10.0,
    )
    indexed_chunks = ai_engine.compute_chunk_embeddings(chunks)
    for c in indexed_chunks:
        session.add(c)

    chapters_data: List[Tuple[float, str, str]] = [
        (
            0.0,
            "1. Введение и предпосылки создания Transformer",
            "Переход от последовательных сетей к параллельным матричным вычислениям.",
        ),
        (
            30.5,
            "2. Математика Scaled Dot-Product Attention",
            "Матрицы Query, Key, Value и вычисление скалярных весов внимания.",
        ),
        (
            67.5,
            "3. Multi-Head Attention и позиционное кодирование",
            "Многоголовый механизм внимания и гармоническое кодирование порядка слов.",
        ),
        (
            86.5,
            "4. LayerNorm, Residual Connections и LLM",
            "Стабилизация глубоких сетей, остаточные связи и масштабирование моделей.",
        ),
    ]
    for start, title, summary in chapters_data:
        session.add(
            LectureChapter(
                lecture_id=lecture.id or 0,
                title=title,
                start_time=start,
                summary=summary,
            )
        )

    glossary_data: List[Tuple[str, float, str]] = [
        (
            "Self-Attention",
            30.5,
            "Механизм внутреннего внимания, связывающий токен со всеми остальными.",
        ),
        (
            "Query Key Value",
            39.0,
            "Проекционные матрицы Q, K, V для сопоставления запросов и ключей.",
        ),
        (
            "Softmax",
            58.0,
            "Нормирующая функция распределения вероятностей весов внимания.",
        ),
        (
            "Multi-Head Attention",
            67.5,
            "Многоголовый механизм внимания в параллельных подпространствах.",
        ),
        (
            "Positional Encoding",
            77.0,
            "Внедрение векторных представлений порядка токенов на основе гармоник.",
        ),
        (
            "LayerNorm",
            86.5,
            "Послойная нормализация активаций для стабилизации обучения.",
        ),
        (
            "Residual Connections",
            86.5,
            "Остаточные сквозные связи, предотвращающие затухание градиента.",
        ),
    ]
    for term, timecode, definition in glossary_data:
        session.add(
            GlossaryTerm(
                lecture_id=lecture.id or 0,
                term=term,
                definition=definition,
                first_timecode=timecode,
            )
        )

    session.commit()
    session.refresh(lecture)
    return lecture
