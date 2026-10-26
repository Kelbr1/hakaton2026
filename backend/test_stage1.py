import io

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from backend.main import app
from backend.models import (
    GlossaryTerm,
    Lecture,
    LectureChapter,
    SearchChunk,
    TranscriptSegment,
    create_db_and_tables,
    engine,
)


def run_tests() -> None:
    create_db_and_tables()

    # 1. Проверка структуры БД и связей
    with Session(engine) as session:
        test_lec = Lecture(
            title="Тестовая лекция по ИИ",
            source_type="file",
            status="ready",
            duration=120.5,
        )
        session.add(test_lec)
        session.commit()
        session.refresh(test_lec)
        assert test_lec.id is not None

        seg = TranscriptSegment(
            lecture_id=test_lec.id,
            start_time=0.0,
            end_time=5.2,
            text="Добро пожаловать на лекцию",
        )
        chunk = SearchChunk(
            lecture_id=test_lec.id,
            start_time=0.0,
            end_time=30.0,
            text="Добро пожаловать на вводную лекцию по искусственному интеллекту.",
            embedding_json="[0.1, 0.2, 0.3]",
        )
        chapter = LectureChapter(
            lecture_id=test_lec.id,
            title="Введение",
            start_time=0.0,
            summary="Вводная часть лекции.",
        )
        term = GlossaryTerm(
            lecture_id=test_lec.id,
            term="LLM",
            definition="Large Language Model",
            first_timecode=2.5,
        )

        session.add_all([seg, chunk, chapter, term])
        session.commit()

        # Проверка каскадной выборки
        lec_reloaded = session.get(Lecture, test_lec.id)
        assert len(lec_reloaded.segments) == 1
        assert len(lec_reloaded.chunks) == 1
        assert len(lec_reloaded.chapters) == 1
        assert len(lec_reloaded.glossary_terms) == 1

        # Очистка тестовой записи
        session.delete(lec_reloaded)
        session.commit()

        orphaned_segs = session.exec(
            select(TranscriptSegment).where(TranscriptSegment.lecture_id == test_lec.id)
        ).all()
        assert len(orphaned_segs) == 0

    # 2. Проверка эндпоинтов через TestClient
    with TestClient(app) as client:
        # Авторизуем тестового пользователя
        reg_resp = client.post(
            "/api/auth/register",
            json={
                "email": "stage1_test@hakaton.ru",
                "password": "Password123!",
                "full_name": "Тестер",
            },
        )
        if reg_resp.status_code == 200:
            token = reg_resp.json()["token"]
        else:
            log_resp = client.post(
                "/api/auth/login",
                json={"email": "stage1_test@hakaton.ru", "password": "Password123!"},
            )
            token = log_resp.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Тест: загрузка файла
        fake_video_bytes = b"FAKE_MP4_HEADER_AND_VIDEO_BYTES_FOR_TESTING_PURPOSES" * 20
        upload_resp = client.post(
            "/api/lectures/upload",
            headers=headers,
            files={
                "file": (
                    "cyber_lecture.mp4",
                    io.BytesIO(fake_video_bytes),
                    "video/mp4",
                )
            },
            data={"title": "Архитектура нейросетей"},
        )
        assert upload_resp.status_code == 201, upload_resp.text
        upload_data = upload_resp.json()
        created_id = upload_data["id"]
        assert upload_data["title"] == "Архитектура нейросетей"
        assert upload_data["source_type"] == "file"

        # Тест: импорт по URL
        url_resp = client.post(
            "/api/lectures/import-url",
            headers=headers,
            json={"url": "https://example.com/video.mp4", "title": "Лекция из Сети"},
        )
        assert url_resp.status_code == 201, url_resp.text
        url_data = url_resp.json()
        assert url_data["title"] == "Лекция из Сети"

        # Тест: получение списка
        list_resp = client.get("/api/lectures")
        assert list_resp.status_code == 200
        lectures_list = list_resp.json()
        assert len(lectures_list) >= 2

        # Тест: получение деталей по ID
        detail_resp = client.get(f"/api/lectures/{created_id}")
        assert detail_resp.status_code == 200
        detail_data = detail_resp.json()
        assert detail_data["id"] == created_id
        assert "segments" in detail_data
        assert "chapters" in detail_data
        assert "glossary_terms" in detail_data

        # Тест: HTTP Range стриминг
        # Без Range -> 200 OK
        stream_full = client.get(f"/api/lectures/{created_id}/stream")
        assert stream_full.status_code == 200
        assert stream_full.headers["accept-ranges"] == "bytes"
        assert len(stream_full.content) == len(fake_video_bytes)

        # С Range: bytes=0-19 -> 206 Partial Content
        stream_range = client.get(
            f"/api/lectures/{created_id}/stream",
            headers={"Range": "bytes=0-19"},
        )
        assert stream_range.status_code == 206
        range_header_val = f"bytes 0-19/{len(fake_video_bytes)}"
        assert stream_range.headers["content-range"] == range_header_val
        assert len(stream_range.content) == 20
        assert stream_range.content == fake_video_bytes[:20]

        # С Range с открытым концом: bytes=100- -> 206 Partial Content
        stream_tail = client.get(
            f"/api/lectures/{created_id}/stream",
            headers={"Range": "bytes=100-"},
        )
        assert stream_tail.status_code == 206
        expected_len = len(fake_video_bytes) - 100
        assert len(stream_tail.content) == expected_len
        assert stream_tail.content == fake_video_bytes[100:]

        # Невалидный Range -> 416
        stream_invalid = client.get(
            f"/api/lectures/{created_id}/stream",
            headers={"Range": "bytes=99999-100000"},
        )
        assert stream_invalid.status_code == 416

        # Тест: удаление лекции
        del_resp = client.delete(f"/api/lectures/{created_id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["success"] is True

        # Проверка, что после удаления 404
        get_deleted = client.get(f"/api/lectures/{created_id}")
        assert get_deleted.status_code == 404

        # Очистка второй созданной лекции
        client.delete(f"/api/lectures/{url_data['id']}")

    print("ВСЕ ТЕСТЫ ЭТАПА 1 УСПЕШНО ПРОЙДЕНЫ!")


if __name__ == "__main__":
    run_tests()
