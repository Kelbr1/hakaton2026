import json
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlmodel import Session

from .ai_engine import AIEngine
from .models import TranscriptSegment

OLLAMA_BASE_URL: str = "http://localhost:11434"
MODEL_PRIORITY: List[str] = ["qwen2.5:7b", "qwen2.5:3b", "llama3.2"]

_status_cache: Dict[str, Any] = {"data": None, "time": 0.0}


def russian_stem(word: str) -> str:
    w = word.lower().strip()
    endings = [
        "овского", "евского", "овскому", "евскому",
        "ического", "ическому", "ическим", "ических",
        "овский", "евский", "овская", "евская", "овское", "евское",
        "ический", "ическая", "ическое", "ические", "ической", "ическую",
        "енного", "енному", "енным", "енных", "енный", "енная", "енное", "енные",
        "нного", "нному", "нным", "нных", "нный", "нная", "нное", "нные",
        "ого", "его", "ому", "ему", "ыми", "ими", "ых", "их", "ую", "юю",
        "ый", "ий", "ой", "ей", "ая", "яя", "ое", "ее", "ые", "ие",
        "ов", "ев", "ей", "ом", "ем", "ам", "ям", "ах", "ях",
        "а", "я", "у", "ю", "о", "е", "ы", "и",
    ]
    for end in endings:
        if w.endswith(end) and len(w) - len(end) >= 3:
            return w[:-len(end)]
    return w


def find_term_timecode(
    term: str,
    segments: List[TranscriptSegment],
    fallback_time: float = 0.0,
) -> float:
    clean = term.strip().lower()
    words = [w for w in re.findall(r"[а-яa-z0-9]+", clean) if len(w) >= 3]
    if not words:
        return fallback_time

    stems = [russian_stem(w) for w in words]

    # 1. Точная фраза по границам слов при нескольких словах
    if len(words) >= 2:
        phrase_pattern = r"\b" + r"\s+".join(re.escape(w) for w in words) + r"\b"
        for s in segments:
            if re.search(phrase_pattern, s.text.lower()):
                return round(s.start_time, 1)

    # 2. Совпадение всех корней слов как отдельных токенов в одном сегменте
    for s in segments:
        seg_tokens = re.findall(r"[а-яa-z0-9]+", s.text.lower())
        seg_stems = [russian_stem(t) for t in seg_tokens]
        if all(stem in seg_stems for stem in stems):
            return round(s.start_time, 1)

    # 3. Для составных терминов: совпадение корней в паре соседних сегментов
    if len(stems) >= 2:
        for i in range(len(segments) - 1):
            pair_tokens = re.findall(
                r"[а-яa-z0-9]+",
                (segments[i].text + " " + segments[i + 1].text).lower(),
            )
            pair_stems = [russian_stem(t) for t in pair_tokens]
            if all(stem in pair_stems for stem in stems):
                return round(segments[i].start_time, 1)

    # 4. Одиночный термин или совпадение главного корня по токенам
    for s in segments:
        seg_tokens = re.findall(r"[а-яa-z0-9]+", s.text.lower())
        seg_stems = [russian_stem(t) for t in seg_tokens]
        if stems[0] in seg_stems:
            return round(s.start_time, 1)

    # 5. Для составных терминов: совпадение любого значимого корня (например, фамилии или определяющего слова)
    if len(stems) >= 2:
        for stem in reversed(stems):
            if len(stem) >= 4 and stem not in {"тока", "срок", "часть", "вещь", "общий", "направление"}:
                for s in segments:
                    seg_tokens = re.findall(r"[а-яa-z0-9]+", s.text.lower())
                    seg_stems = [russian_stem(t) for t in seg_tokens]
                    if stem in seg_stems:
                        return round(s.start_time, 1)

    return fallback_time


def parse_timecode_to_seconds(raw_val: Any) -> float:
    if isinstance(raw_val, (int, float)):
        return max(0.0, float(raw_val))
    if not isinstance(raw_val, str):
        return 0.0
    val = raw_val.strip("[] \t\r\n")
    if not val:
        return 0.0
    if ":" in val:
        parts = val.split(":")
        try:
            if len(parts) == 2:
                return round(float(parts[0]) * 60 + float(parts[1]), 1)
            elif len(parts) == 3:
                return round(float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2]), 1)
        except ValueError:
            pass
    try:
        return round(float(val), 1)
    except ValueError:
        return 0.0


def _format_timecode(seconds: float) -> str:
    total_sec = max(0, int(seconds))
    mins = total_sec // 60
    secs = total_sec % 60
    return f"{mins:02d}:{secs:02d}"


def get_ollama_status() -> Dict[str, Any]:
    now = time.time()
    if _status_cache["data"] is not None and (now - _status_cache["time"]) < 3.0:
        return _status_cache["data"]

    try:
        with httpx.Client(timeout=0.5) as client:
            resp = client.get(f"{OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m.get("name", "") for m in data.get("models", [])]
                selected_model: Optional[str] = None
                for prio in MODEL_PRIORITY:
                    for model_name in models:
                        if model_name.startswith(prio):
                            selected_model = model_name
                            break
                    if selected_model:
                        break

                if not selected_model and models:
                    selected_model = models[0]

                res = {
                    "online": True,
                    "active_model": selected_model,
                    "available_models": models,
                }
                _status_cache["data"] = res
                _status_cache["time"] = now
                return res
    except Exception:
        pass

    fallback_res = {
        "online": False,
        "active_model": None,
        "available_models": [],
    }
    _status_cache["data"] = fallback_res
    _status_cache["time"] = now
    return fallback_res


def _algorithmic_fallback_summary(
    segments: List[TranscriptSegment],
    lecture_title: str,
    duration: float,
) -> Tuple[str, List[Dict[str, Any]], List[Dict[str, Any]]]:
    # Фоллбэк-механизм: алгоритмическая генерация конспекта, глав и глоссария без LLM
    if not segments:
        default_summary = (
            f"# Конспект: {lecture_title}\n\n"
            "Текстовая дорожка не содержит распознанных сегментов."
        )
        return default_summary, [], []

    full_text = " ".join(s.text.strip() for s in segments)
    effective_duration = duration if duration > 0 else segments[-1].end_time

    # 1. Формирование разделов по временным интервалам
    if effective_duration >= 180:
        num_chapters = 4
    elif effective_duration >= 60:
        num_chapters = 3
    else:
        num_chapters = 1

    chapter_interval = effective_duration / num_chapters
    chapters: List[Dict[str, Any]] = []

    titles_pool = [
        "Введение и постановка целей",
        "Теоретические концепции и терминология",
        "Практический разбор и методология",
        "Итоги, выводы и ключевые рекомендации",
    ]

    for i in range(num_chapters):
        ch_start = round(i * chapter_interval, 2)
        ch_end = round((i + 1) * chapter_interval, 2)
        ch_segs = [
            s
            for s in segments
            if (s.start_time >= ch_start and s.start_time < ch_end)
            or (i == num_chapters - 1 and s.start_time >= ch_start)
        ]
        ch_text = " ".join(s.text.strip() for s in ch_segs)
        if len(ch_text) > 280:
            summary_text = ch_text[:280] + "..."
        else:
            summary_text = ch_text or "Обзор раздела."

        title = titles_pool[i] if i < len(titles_pool) else f"Раздел {i + 1}"
        chapters.append(
            {
                "title": title,
                "start_time": ch_start,
                "summary": summary_text,
            }
        )

    # 2. Алгоритмическое выделение ключевых терминов для глоссария
    words = re.findall(r"\b[A-Za-zА-Яа-яЁё]{4,}\b", full_text)
    term_candidates: List[Tuple[str, float, str]] = []
    seen_terms: set[str] = set()

    stop_words = {
        "это", "как", "что", "для", "при", "все", "так", "уже", "если",
        "когда", "быть", "было", "будет", "может", "можно", "также",
        "этого", "после", "через", "только", "более", "очень", "своей",
        "здравствуйте", "привет", "скажи", "никто", "подписывайся",
        "подписывайтесь", "первое", "второе", "третье", "давайте",
        "смотрите", "кстати", "владислав", "интенсив", "курс", "course",
        "intensive", "канал", "лайк", "колокольчик", "видео", "урок",
        "сегодня", "сейчас", "просто", "вообще", "наверное", "короче",
    }

    for seg in segments:
        seg_words = re.findall(r"\b[A-Za-zА-Яа-яЁё0-9\-_]{4,}\b", seg.text)
        for w in seg_words:
            w_lower = w.lower()
            if w_lower in stop_words or len(w) < 4:
                continue
            is_capital = w.isupper() if len(w) >= 2 else False
            is_title = w[0].isupper() and w_lower not in seen_terms
            if is_capital or is_title:
                seen_terms.add(w_lower)
                ctx_snippet = seg.text[:120]
                definition = f"Понятие в контексте: «{ctx_snippet}...»"
                term_candidates.append((w, seg.start_time, definition))
            if len(term_candidates) >= 8:
                break
        if len(term_candidates) >= 8:
            break

    # Дополнение частотными терминами при необходимости
    if len(term_candidates) < 6 and words:
        from collections import Counter

        counts = Counter(w.lower() for w in words if w.lower() not in stop_words)
        for w, _ in counts.most_common(12):
            if w not in seen_terms:
                seen_terms.add(w)
                first_time = 0.0
                first_ctx = full_text[:100]
                for seg in segments:
                    if w in seg.text.lower():
                        first_time = seg.start_time
                        first_ctx = seg.text
                        break
                definition = f"Ключевой концепт: «{first_ctx[:100]}...»"
                term_candidates.append((w.capitalize(), first_time, definition))
            if len(term_candidates) >= 8:
                break

    glossary = [
        {
            "term": term,
            "definition": definition,
            "first_timecode": round(timecode, 2),
        }
        for term, timecode, definition in term_candidates
    ]

    # 3. Формирование Markdown-конспекта
    summary_lines = [
        f"# Аналитический конспект: {lecture_title}",
        "",
        "## Краткое содержание",
        (full_text[:500] + "...") if len(full_text) > 500 else full_text,
        "",
        "## Структура лекции по главам",
    ]
    for ch in chapters:
        tc = _format_timecode(ch["start_time"])
        summary_lines.append(f"- **[{tc}] {ch['title']}**: {ch['summary']}")

    summary_lines.extend(
        [
            "",
            "## Ключевые термины",
        ]
    )
    for g in glossary:
        tc = _format_timecode(g["first_timecode"])
        summary_lines.append(f"- **{g['term']}** `[{tc}]`: {g['definition']}")

    summary_markdown = "\n".join(summary_lines)
    return summary_markdown, chapters, glossary


def generate_lecture_artifacts(
    segments: List[TranscriptSegment],
    lecture_title: str,
    duration: float,
) -> Tuple[str, List[Dict[str, Any]], List[Dict[str, Any]]]:
    if not segments:
        return _algorithmic_fallback_summary(segments, lecture_title, duration)

    status = get_ollama_status()
    if not status["online"] or not status["active_model"]:
        return _algorithmic_fallback_summary(segments, lecture_title, duration)

    active_model = status["active_model"]

    formatted_transcript_parts: List[str] = []
    for s in segments:
        tc = _format_timecode(s.start_time)
        formatted_transcript_parts.append(f"[{tc}] {s.text}")

    # Ограничиваем объем текста для стабильной работы локальных LLM
    transcript_preview = "\n".join(formatted_transcript_parts[:400])

    dur_str = _format_timecode(duration)
    prompt = (
        f"Ты опытный академический редактор. Ниже приведен транскрипт "
        f"видеолекции «{lecture_title}» общей длительностью {dur_str}.\n"
        f"Перед каждой фразой в квадратных скобках указан точный таймкод [MM:SS].\n\n"
        f"Транскрипт:\n{transcript_preview}\n\n"
        "Инструкции:\n"
        "1. Составь структурированный конспект лекции в Markdown на русском языке с ключевыми выводами.\n"
        f"2. Разбей лекцию на 3-6 логических глав, охватывающих ВСЮ длительность лекции (от 00:00 до {dur_str}). Для каждой главы укажи 'timecode' в формате 'MM:SS' строго из транскрипта, где начинается данная тема.\n"
        "3. Выдели 5-10 ключевых научных/учебных терминов лекции и дай им четкие определения.\n\n"
        "Ответь СТРОГО в формате JSON:\n"
        "{\n"
        '  "summary_markdown": "# Конспект лекции\\n\\n...",\n'
        '  "chapters": [\n'
        '    {"title": "Название раздела", "timecode": "00:00", "summary": "Краткое содержание раздела"}\n'
        "  ],\n"
        '  "glossary": [\n'
        '    {"term": "Термин", "definition": "Определение термина"}\n'
        "  ]\n"
        "}"
    )

    try:
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": active_model,
                    "prompt": prompt,
                    "format": "json",
                    "stream": False,
                    "options": {"temperature": 0.2},
                },
            )
            if resp.status_code == 200:
                body = resp.json()
                raw_response = body.get("response", "").strip()
                parsed = json.loads(raw_response)

                summary_md = parsed.get("summary_markdown", "").strip()
                chapters_raw = parsed.get("chapters", [])
                glossary_raw = parsed.get("glossary", [])

                chapters: List[Dict[str, Any]] = []
                last_time = 0.0
                for i, c in enumerate(chapters_raw):
                    if not isinstance(c, dict):
                        continue
                    ch_title = str(c.get("title", f"Раздел {i + 1}")).strip()
                    raw_tc = c.get("timecode") or c.get("start_time")
                    parsed_sec = parse_timecode_to_seconds(raw_tc)
                    if parsed_sec < last_time or parsed_sec > duration:
                        if i == 0:
                            parsed_sec = 0.0
                        else:
                            anchored = find_term_timecode(ch_title, segments, fallback_time=last_time)
                            if anchored >= last_time and anchored <= duration:
                                parsed_sec = anchored
                            else:
                                parsed_sec = last_time + 10.0
                    last_time = parsed_sec
                    chapters.append({
                        "title": ch_title,
                        "start_time": parsed_sec,
                        "summary": str(c.get("summary", "")).strip(),
                    })

                glossary: List[Dict[str, Any]] = []
                for g in glossary_raw:
                    if not isinstance(g, dict) or not g.get("term"):
                        continue
                    term_name = str(g.get("term", "")).strip()
                    raw_tc = parse_timecode_to_seconds(g.get("timecode") or g.get("first_timecode", 0.0))
                    # Рассчитываем точный таймкод первого произнесения термина в речи
                    exact_tc = find_term_timecode(term_name, segments, fallback_time=raw_tc)
                    glossary.append({
                        "term": term_name,
                        "definition": str(g.get("definition", "")).strip(),
                        "first_timecode": exact_tc,
                    })

                if summary_md and chapters:
                    if not summary_md.startswith("# Аналитический конспект:"):
                        first_line_end = summary_md.find("\n")
                        rest = summary_md[first_line_end:].strip() if first_line_end != -1 else ""
                        summary_md = f"# Аналитический конспект: {lecture_title}\n\n{rest}"
                    return summary_md, chapters, glossary
    except Exception:
        pass

    return _algorithmic_fallback_summary(segments, lecture_title, duration)


def answer_lecture_question(
    question: str,
    lecture_id: int,
    session: Session,
) -> Dict[str, Any]:
    ai_engine = AIEngine.get_instance()
    top_chunks = ai_engine.search_semantic(
        query=question,
        session=session,
        lecture_id=lecture_id,
        top_k=4,
    )

    if not top_chunks:
        return {
            "answer": "В материалах лекции пока не найдено информации по вопросу.",
            "sources": [],
        }

    sources = [
        {
            "timecode": c["start_time"],
            "text": c["text"],
            "score": c["score"],
        }
        for c in top_chunks
    ]

    status = get_ollama_status()
    if status["online"] and status["active_model"]:
        active_model = status["active_model"]
        context_blocks = "\n\n".join(
            f"[{_format_timecode(c['start_time'])}] {c['text']}" for c in top_chunks
        )

        prompt = (
            "Ты умный ассистент по видеолекциям. Ответь на вопрос на русском языке, "
            "опираясь ИСКЛЮЧИТЕЛЬНО на предоставленный контекст лекции.\n\n"
            f"Контекст:\n{context_blocks}\n\n"
            f"Вопрос: {question}\n\n"
            "Ответ:"
        )

        try:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": active_model,
                        "prompt": prompt,
                        "stream": False,
                        "options": {"temperature": 0.3},
                    },
                )
                if resp.status_code == 200:
                    answer_text = resp.json().get("response", "").strip()
                    if answer_text:
                        return {"answer": answer_text, "sources": sources}
        except Exception:
            pass

    # Фоллбэк: формирование ответа на основе наиболее релевантных сегментов транскрипта
    most_relevant = top_chunks[0]
    tc = _format_timecode(most_relevant["start_time"])
    fallback_answer = (
        "*(Локальная нейросеть Ollama сейчас оффлайн. "
        "Ответ сформирован на основе семантического анализа транскрипта):*\n\n"
        f"Наиболее точный фрагмент найден на таймкоде **[{tc}]** "
        f"с релевантностью **{most_relevant['score']}%**:\n\n"
        f"«{most_relevant['text']}»"
    )

    return {"answer": fallback_answer, "sources": sources}


_quiz_cache: Dict[int, Dict[str, Any]] = {}


def _algorithmic_fallback_quiz(
    lecture_id: int,
    lecture_title: str,
    chapters: List[Any],
    glossary: List[Any],
    segments: List[TranscriptSegment],
) -> Dict[str, Any]:
    import random

    questions: List[Dict[str, Any]] = []
    q_id = 1

    # 1. Вопросы по терминам глоссария лекции
    if glossary:
        sample_terms = [g for g in glossary if getattr(g, "term", None) and getattr(g, "definition", None)][:4]
        all_defs = [getattr(g, "definition", "") for g in glossary if getattr(g, "definition", None)]

        for g in sample_terms:
            term_name = getattr(g, "term", "")
            definition = getattr(g, "definition", "")
            timecode = getattr(g, "first_timecode", 0.0)

            other_defs = [d for d in all_defs if d != definition]
            distractors = other_defs[:3]
            placeholders = [
                "Метод оптимизации градиентного спуска без использования матриц весов.",
                "Вспомогательный алгоритм для сжатия исходных видео- и аудиопотоков.",
                "Параметр скорости обучения нейросети, уменьшающийся со временем.",
                "Математическая операция нормализации скрытого состояния сети.",
            ]
            for p in placeholders:
                if len(distractors) >= 3:
                    break
                if p not in distractors and p != definition:
                    distractors.append(p)

            raw_options = [
                {"text": definition, "is_correct": True},
                {"text": distractors[0] if len(distractors) > 0 else placeholders[0], "is_correct": False},
                {"text": distractors[1] if len(distractors) > 1 else placeholders[1], "is_correct": False},
                {"text": distractors[2] if len(distractors) > 2 else placeholders[2], "is_correct": False},
            ]
            random.seed(lecture_id + q_id * 13)
            random.shuffle(raw_options)

            options = []
            correct_id = "A"
            for idx, opt in enumerate(raw_options):
                opt_id = ["A", "B", "C", "D"][idx]
                options.append({"id": opt_id, "text": opt["text"]})
                if opt["is_correct"]:
                    correct_id = opt_id

            tc_str = _format_timecode(timecode)
            questions.append({
                "id": q_id,
                "question": f"Что означает понятие «{term_name}» согласно материалам лекции?",
                "options": options,
                "correct_option_id": correct_id,
                "explanation": f"В лекции на отметке [{tc_str}] лектор формулирует: «{definition}».",
                "timecode": round(timecode, 1),
            })
            q_id += 1

    # 2. Вопросы по разделам и ключевым главам
    if chapters and len(questions) < 5:
        for ch in chapters[:3]:
            ch_title = getattr(ch, "title", "")
            summary = getattr(ch, "summary", "")
            timecode = getattr(ch, "start_time", 0.0)
            if not ch_title or not summary or len(summary) < 10:
                continue

            other_summaries = [getattr(c, "summary", "") for c in chapters if getattr(c, "summary", "") != summary]
            distractors = [s for s in other_summaries if s][:3]
            fallbacks = [
                "Исторический обзор развития вычислительной техники 1980-х годов.",
                "Сравнение стоимости различных аппаратных ускорителей и серверов.",
                "Инструкция по установке сторонних драйверов операционной системы.",
            ]
            for f in fallbacks:
                if len(distractors) >= 3:
                    break
                if f not in distractors:
                    distractors.append(f)

            raw_options = [
                {"text": summary, "is_correct": True},
                {"text": distractors[0] if len(distractors) > 0 else fallbacks[0], "is_correct": False},
                {"text": distractors[1] if len(distractors) > 1 else fallbacks[1], "is_correct": False},
                {"text": distractors[2] if len(distractors) > 2 else fallbacks[2], "is_correct": False},
            ]
            random.seed(lecture_id + q_id * 19)
            random.shuffle(raw_options)

            options = []
            correct_id = "A"
            for idx, opt in enumerate(raw_options):
                opt_id = ["A", "B", "C", "D"][idx]
                options.append({"id": opt_id, "text": opt["text"]})
                if opt["is_correct"]:
                    correct_id = opt_id

            clean_ch_title = re.sub(r"^\d+\.\s*", "", ch_title)
            tc_str = _format_timecode(timecode)
            questions.append({
                "id": q_id,
                "question": f"Какая ключевая тема подробно раскрывается в разделе «{clean_ch_title}»?",
                "options": options,
                "correct_option_id": correct_id,
                "explanation": f"В разделе «{clean_ch_title}» (начиная с [{tc_str}]) объясняется: «{summary}».",
                "timecode": round(timecode, 1),
            })
            q_id += 1
            if len(questions) >= 5:
                break

    # 3. Дополнительный вопрос по содержанию лекции, если вопросов мало
    if len(questions) < 3 and segments:
        mid_idx = len(segments) // 2
        mid_seg = segments[mid_idx]
        tc_str = _format_timecode(mid_seg.start_time)
        questions.append({
            "id": q_id,
            "question": f"О чем рассказывается в центральной части лекции «{lecture_title}»?",
            "options": [
                {"id": "A", "text": f"Обсуждается практический аспект: «{mid_seg.text[:95]}...»"},
                {"id": "B", "text": "Рассматриваются правила оформления академических отчетов."},
                {"id": "C", "text": "Проводится демонстрация сторонних программных инструментов без теории."},
                {"id": "D", "text": "Обсуждаются административные вопросы расписания сессии."},
            ],
            "correct_option_id": "A",
            "explanation": f"На таймкоде [{tc_str}] лектор подробно излагает этот материал.",
            "timecode": round(mid_seg.start_time, 1),
        })

    return {
        "lecture_id": lecture_id,
        "lecture_title": lecture_title,
        "total_questions": len(questions),
        "questions": questions,
    }


def generate_lecture_quiz(
    lecture_id: int,
    session: Session,
    force_regenerate: bool = False,
) -> Dict[str, Any]:
    global _quiz_cache
    if not force_regenerate and lecture_id in _quiz_cache:
        return _quiz_cache[lecture_id]

    from .models import Lecture

    lecture = session.get(Lecture, lecture_id)
    if not lecture:
        return {"lecture_id": lecture_id, "questions": [], "total_questions": 0}

    segments = list(lecture.segments)
    chapters = list(lecture.chapters)
    glossary = list(lecture.glossary_terms)

    status = get_ollama_status()
    if status["online"] and status["active_model"] and segments:
        active_model = status["active_model"]

        context_parts: List[str] = []
        if chapters:
            context_parts.append("Разделы лекции:")
            for ch in chapters:
                context_parts.append(f"- [{_format_timecode(ch.start_time)}] {ch.title}: {ch.summary}")

        if glossary:
            context_parts.append("\nГлоссарий терминов:")
            for g in glossary:
                context_parts.append(f"- [{_format_timecode(g.first_timecode)}] {g.term}: {g.definition}")

        context_parts.append("\nФрагменты речи:")
        step = max(1, len(segments) // 25)
        for s in segments[::step][:30]:
            context_parts.append(f"[{_format_timecode(s.start_time)}] {s.text}")

        context_text = "\n".join(context_parts)

        prompt = (
            f"Ты опытный академический преподаватель. Составь интерактивный тест (квиз) "
            f"из 4-5 вопросов для проверки знаний студента по видеолекции «{lecture.title}».\n\n"
            f"Материалы лекции:\n{context_text}\n\n"
            "Инструкции:\n"
            "1. Составь от 3 до 5 качественных вопросов с 4 вариантами ответа (A, B, C, D).\n"
            "2. Ровно один вариант ответа должен быть правильным.\n"
            "3. Поле 'explanation' должно кратко и емко объяснять правильный ответ со ссылкой на лекцию.\n"
            "4. Поле 'timecode' должно содержать точный таймкод (числом секунд, например 45.0 или 120.5), где в лекции об этом говорится.\n\n"
            "Ответь СТРОГО в формате JSON:\n"
            "{\n"
            '  "questions": [\n'
            '    {\n'
            '      "id": 1,\n'
            '      "question": "Текст вопроса?",\n'
            '      "options": [\n'
            '        {"id": "A", "text": "Вариант 1"},\n'
            '        {"id": "B", "text": "Вариант 2"},\n'
            '        {"id": "C", "text": "Вариант 3"},\n'
            '        {"id": "D", "text": "Вариант 4"}\n'
            '      ],\n'
            '      "correct_option_id": "A",\n'
            '      "explanation": "Объяснение, почему вариант правильный...",\n'
            '      "timecode": 45.0\n'
            '    }\n'
            '  ]\n'
            "}"
        )

        try:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    json={
                        "model": active_model,
                        "prompt": prompt,
                        "format": "json",
                        "stream": False,
                        "options": {"temperature": 0.3},
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    parsed = json.loads(data.get("response", "{}"))
                    raw_questions = parsed.get("questions", [])
                    if isinstance(raw_questions, list) and len(raw_questions) >= 2:
                        validated_questions = []
                        for idx, q in enumerate(raw_questions):
                            if not isinstance(q, dict):
                                continue
                            q_text = str(q.get("question", "")).strip()
                            raw_opts = q.get("options", [])
                            if not q_text or len(raw_opts) < 2:
                                continue

                            opts = []
                            for o_idx, opt in enumerate(raw_opts[:4]):
                                if isinstance(opt, dict):
                                    o_id = str(opt.get("id", ["A", "B", "C", "D"][o_idx])).upper()
                                    o_text = str(opt.get("text", "")).strip()
                                else:
                                    o_id = ["A", "B", "C", "D"][o_idx]
                                    o_text = str(opt).strip()
                                opts.append({"id": o_id, "text": o_text})

                            correct_id = str(q.get("correct_option_id", "A")).upper()
                            if correct_id not in [o["id"] for o in opts]:
                                correct_id = opts[0]["id"]

                            raw_tc = q.get("timecode", 0.0)
                            tc_sec = parse_timecode_to_seconds(raw_tc)
                            if tc_sec <= 0 and segments:
                                tc_sec = find_term_timecode(q_text, segments, fallback_time=0.0)

                            validated_questions.append({
                                "id": idx + 1,
                                "question": q_text,
                                "options": opts,
                                "correct_option_id": correct_id,
                                "explanation": str(q.get("explanation", "Правильный ответ подтверждается материалами лекции.")).strip(),
                                "timecode": round(tc_sec, 1),
                            })

                        if validated_questions:
                            res = {
                                "lecture_id": lecture_id,
                                "lecture_title": lecture.title,
                                "total_questions": len(validated_questions),
                                "questions": validated_questions,
                            }
                            _quiz_cache[lecture_id] = res
                            return res
        except Exception:
            pass

    # Фоллбэк: генерация теста на основе разделов и глоссария
    res = _algorithmic_fallback_quiz(
        lecture_id=lecture_id,
        lecture_title=lecture.title,
        chapters=chapters,
        glossary=glossary,
        segments=segments,
    )
    _quiz_cache[lecture_id] = res
    return res

