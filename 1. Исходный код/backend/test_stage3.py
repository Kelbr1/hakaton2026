"""Automated integration tests for Authentication, Categories, and Favorites."""

import time

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from backend.main import app
from backend.models import (
    Lecture,
    User,
    UserFavorite,
    UserSessionToken,
    engine,
)


def test_auth_categories_favorites():
    client = TestClient(app)

    # 1. Check system status (offline/online LLM status)
    status_resp = client.get("/api/system/status")
    assert status_resp.status_code == 200, f"Status failed: {status_resp.text}"
    status_data = status_resp.json()
    assert "ollama" in status_data
    assert "whisper" in status_data

    # 2. Check that upload is blocked for guests
    upload_guest = client.post(
        "/api/lectures/import-url",
        json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "title": "Test"},
    )
    assert upload_guest.status_code == 401

    # 3. Register a test user
    test_email = "academic_jury@test.org"
    # Clean up test user if previously created
    with Session(engine) as session:
        existing = session.exec(select(User).where(User.email == test_email)).first()
        if existing:
            tokens = session.exec(
                select(UserSessionToken).where(
                    UserSessionToken.user_id == existing.id
                )
            ).all()
            for t in tokens:
                session.delete(t)
            favs = session.exec(
                select(UserFavorite).where(
                    UserFavorite.user_id == existing.id
                )
            ).all()
            for f in favs:
                session.delete(f)
            session.delete(existing)
            session.commit()

    reg_resp = client.post(
        "/api/auth/register",
        json={
            "email": test_email,
            "password": "SecurePassword123!",
            "full_name": "Профессор Иванов",
        },
    )
    assert reg_resp.status_code == 200, f"Register failed: {reg_resp.text}"
    reg_data = reg_resp.json()
    token = reg_data["token"]
    assert token, "Token must be returned"
    assert reg_data["user"]["full_name"] == "Профессор Иванов"
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 4. Check /api/auth/me
    me_resp = client.get("/api/auth/me", headers=auth_headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["user"]["email"] == test_email

    # 5. Create unique test category
    unique_suffix = int(time.time() * 1000)
    cat_initial_name = f"Математика {unique_suffix}"
    new_cat_name = f"Высшая Математика {unique_suffix}"

    cat_resp = client.post(
        "/api/categories",
        headers=auth_headers,
        json={"name": cat_initial_name, "color": "purple"},
    )
    assert cat_resp.status_code in (200, 201)
    category = cat_resp.json()
    cat_id = category["id"]
    assert category["name"] == cat_initial_name

    # List categories
    cats_resp = client.get("/api/categories")
    assert cats_resp.status_code == 200
    cat_names = [c["name"] for c in cats_resp.json()]
    assert cat_initial_name in cat_names

    # Rename category
    update_cat_resp = client.put(
        f"/api/categories/{cat_id}",
        headers=auth_headers,
        json={"name": new_cat_name, "color": "purple"},
    )
    assert (
        update_cat_resp.status_code == 200
    ), f"Update cat failed: {update_cat_resp.text}"
    assert update_cat_resp.json()["name"] == new_cat_name

    # 6. Check lecture favorite toggle
    # Find any lecture in DB or create a mock ready lecture
    with Session(engine) as session:
        lecture = session.exec(select(Lecture)).first()
        if not lecture:
            lecture = Lecture(
                title="Тестовая лекция по Математике",
                source_type="file",
                duration=360.0,
                status="ready",
                category_id=cat_id,
            )
            session.add(lecture)
            session.commit()
            session.refresh(lecture)
        lecture_id = lecture.id
        lecture.category_id = cat_id
        session.add(lecture)
        session.commit()

    # Toggle favorite: add
    fav_add = client.post(f"/api/lectures/{lecture_id}/favorite", headers=auth_headers)
    assert fav_add.status_code == 200
    assert fav_add.json()["is_favorite"] is True

    # Get lectures with token -> is_favorite should be True
    lecs_resp = client.get("/api/lectures", headers=auth_headers)
    assert lecs_resp.status_code == 200
    target_lec = next(
        (lec for lec in lecs_resp.json() if lec["id"] == lecture_id),
        None,
    )
    assert target_lec is not None
    assert target_lec["is_favorite"] is True
    assert target_lec["category"] is not None
    assert target_lec["category"]["name"] == new_cat_name

    # Filter only favorites
    lecs_fav_resp = client.get(
        "/api/lectures?only_favorites=true",
        headers=auth_headers,
    )
    assert lecs_fav_resp.status_code == 200
    for lec_item in lecs_fav_resp.json():
        assert lec_item["is_favorite"] is True

    # Filter by category
    lecs_cat_resp = client.get(
        f"/api/lectures?category_id={cat_id}",
        headers=auth_headers,
    )
    assert lecs_cat_resp.status_code == 200
    assert len(lecs_cat_resp.json()) >= 1
    for lec_item in lecs_cat_resp.json():
        assert lec_item["category_id"] == cat_id

    # Toggle favorite: remove
    fav_rem = client.post(f"/api/lectures/{lecture_id}/favorite", headers=auth_headers)
    assert fav_rem.status_code == 200
    assert fav_rem.json()["is_favorite"] is False

    # Verify removed
    lecs_resp2 = client.get("/api/lectures", headers=auth_headers)
    target_lec2 = next(
        (lec for lec in lecs_resp2.json() if lec["id"] == lecture_id),
        None,
    )
    assert target_lec2["is_favorite"] is False

    # 7. Test PATCH /api/lectures/{id} to update category of an existing lecture
    patch_resp = client.patch(
        f"/api/lectures/{lecture_id}",
        headers=auth_headers,
        json={"category_id": None},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["category_id"] is None
    assert patch_resp.json()["category"] is None

    # Re-assign category back
    patch_resp2 = client.patch(
        f"/api/lectures/{lecture_id}",
        headers=auth_headers,
        json={"category_id": cat_id},
    )
    assert patch_resp2.status_code == 200
    assert patch_resp2.json()["category_id"] == cat_id
    assert patch_resp2.json()["category"]["id"] == cat_id

    # 8. Logout
    logout_resp = client.post("/api/auth/logout", headers=auth_headers)
    assert logout_resp.status_code == 200

    # Me after logout should fail (401)
    me_after = client.get("/api/auth/me", headers=auth_headers)
    assert me_after.status_code == 401

    print("ALL INTEGRATION TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_auth_categories_favorites()
