from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.ai_engine import AIEngine
from backend.llm_service import (
    answer_lecture_question,
    generate_lecture_artifacts,
    get_ollama_status,
)
from backend.main import app
from backend.models import (
    Lecture,
    SearchChunk,
    TranscriptSegment,
    create_db_and_tables,
    engine,
)


def run_stage2_tests() -> None:
    create_db_and_tables()
    ai_engine = AIEngine.get_instance()

    # 1. Проверка информации об аппаратной части и статусе системы
    hw_info = ai_engine.get_hardware_info()
    assert "device" in hw_info
    assert "compute_type" in hw_info
    assert "cuda_available" in hw_info

    ollama_stat = get_ollama_status()
    assert "online" in ollama_stat
    assert "available_models" in ollama_stat

    # 2. Тестирование алгоритма скользящего окна чанков (~35 сек, overlap 10 сек)
    mock_segments = [
        TranscriptSegment(
            lecture_id=101,
            start_time=0.0,
            end_time=6.5,
            text="Первый блок лекции о введении в машинное обучение.",
        ),
        TranscriptSegment(
            lecture_id=101,
            start_time=6.5,
            end_time=15.0,
            text="Нейросети обучаются на больших объемах размеченных данных.",
        ),
        TranscriptSegment(
            lecture_id=101,
            start_time=15.0,
            end_time=25.0,
            text="Градиентный спуск оптимизирует веса функции потерь.",
        ),
        TranscriptSegment(
            lecture_id=101,
            start_time=25.0,
            end_time=36.0,
            text="Архитектура Transformer заменила рекуррентные сети вниманием.",
        ),
        TranscriptSegment(
            lecture_id=101,
            start_time=36.0,
            end_time=48.0,
            text="Механизм Self-Attention вычисляет веса между всеми токенами.",
        ),
        TranscriptSegment(
            lecture_id=101,
            start_time=48.0,
            end_time=60.0,
            text="В заключение отметим важность нормализации слоев LayerNorm.",
        ),
    ]

    chunks = ai_engine.build_search_chunks(
        segments=mock_segments,
        lecture_id=101,
        target_duration=35.0,
        overlap=10.0,
    )
    assert len(chunks) >= 2, f"Expected at least 2 chunks, got {len(chunks)}"
    assert chunks[0].start_time == 0.0
    assert chunks[0].end_time >= 35.0
    # Проверка наличия перекрытия во втором чанке
    assert chunks[1].start_time < chunks[0].end_time
    assert len(chunks[0].text) > 50

    # 3. Тестирование генерации конспекта, оглавления и глоссария (с фоллбэком)
    summary_md, chapters, glossary = generate_lecture_artifacts(
        segments=mock_segments,
        lecture_title="Основы глубокого обучения",
        duration=60.0,
    )
    assert summary_md.startswith("# Аналитический конспект:") or "конспект" in summary_md.lower()
    assert len(chapters) >= 1
    assert "start_time" in chapters[0]
    assert "title" in chapters[0]
    assert len(glossary) >= 1
    assert "term" in glossary[0]
    assert "first_timecode" in glossary[0]

    # 4. Проверка API через TestClient
    with Session(engine) as session:
        test_lec = Lecture(
            title="Тест ИИ-поиска и RAG",
            source_type="file",
            status="ready",
            duration=60.0,
        )
        session.add(test_lec)
        session.commit()
        session.refresh(test_lec)
        lec_id = test_lec.id

        # Создаем пару синтетических векторов для проверки косинусного поиска
        # Вектор размерности 384
        vec1 = [0.0] * 384
        vec1[0] = 1.0  # единичный вектор по первой координате
        vec2 = [0.0] * 384
        vec2[1] = 1.0  # единичный вектор по второй координате

        import json

        c1 = SearchChunk(
            lecture_id=lec_id,
            start_time=0.0,
            end_time=30.0,
            text="Сверточные нейросети Convolutional Neural Networks для изображений.",
            embedding_json=json.dumps(vec1),
        )
        c2 = SearchChunk(
            lecture_id=lec_id,
            start_time=30.0,
            end_time=60.0,
            text="Трансформеры и языковые модели LLM для обработки текстов.",
            embedding_json=json.dumps(vec2),
        )
        session.add_all([c1, c2])
        session.commit()

        # Тест вопроса по лекции (RAG)
        rag_res = answer_lecture_question(
            question="Что такое Transformer?",
            lecture_id=lec_id,
            session=session,
        )
        assert "answer" in rag_res
        assert "sources" in rag_res
        assert len(rag_res["sources"]) > 0

    with TestClient(app) as client:
        # Тест GET /api/system/status
        status_resp = client.get("/api/system/status")
        assert status_resp.status_code == 200
        st_data = status_resp.json()
        assert st_data["status"] == "online"
        assert "gpu" in st_data
        assert "whisper" in st_data
        assert "ollama" in st_data

        # Тест POST /api/lectures/{id}/ask
        ask_resp = client.post(
            f"/api/lectures/{lec_id}/ask",
            json={"question": "Расскажи про сверточные сети"},
        )
        assert ask_resp.status_code == 200
        ask_data = ask_resp.json()
        assert "answer" in ask_data
        assert len(ask_data["sources"]) > 0

        # Тест 404 для несуществующей лекции
        ask_404 = client.post(
            "/api/lectures/999999/ask",
            json={"question": "Тест"},
        )
        assert ask_404.status_code == 404

        # Очистка тестовой лекции
        client.delete(f"/api/lectures/{lec_id}")

    print("ВСЕ ТЕСТЫ ЭТАПА 2 УСПЕШНО ПРОЙДЕНЫ!")


if __name__ == "__main__":
    run_stage2_tests()
