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
