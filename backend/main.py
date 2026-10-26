import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, Generator, List, Optional

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from .ai_engine import AIEngine
from .demo_seeder import seed_demo_lecture
from .llm_service import (
    answer_lecture_question,
    generate_lecture_artifacts,
    get_ollama_status,
)
from .media_utils import (
    AUDIO_DIR,
    VIDEOS_DIR,
    download_video_from_url,
    extract_audio,
    get_video_duration,
    resolve_media_path,
    save_uploaded_video,
)
from .models import (
    Category,
    CategoryResponse,
    CreateCategoryRequest,
    GlossaryTerm,
    ImportUrlRequest,
    Lecture,
    LectureChapter,
    LectureDetailResponse,
    LectureResponse,
    LoginRequest,
    RegisterRequest,
    UpdateCategoryRequest,
    UpdateLectureRequest,
    User,
    UserFavorite,
    UserResponse,
    UserSessionToken,
    create_db_and_tables,
    engine,
    generate_token,
    get_session,
    hash_password,
    verify_password,
)


class AskQuestionRequest(BaseModel):
    question: str


def get_current_user_optional(
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> Optional[User]:
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        return None
    st = session.exec(
        select(UserSessionToken).where(UserSessionToken.token == token)
    ).first()
    if not st:
        return None
    return session.get(User, st.user_id)


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    user = get_current_user_optional(authorization, session)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Необходима авторизация для выполнения действия",
        )
    return user


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    create_db_and_tables()
    yield


app = FastAPI(
    title="CyberBreak 2026 Semantic Video Search API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _stream_file_range(
    file_path: Path,
    start: int,
    end: int,
    chunk_size: int = 1024 * 1024,
) -> Generator[bytes, None, None]:
    with file_path.open("rb") as stream:
        stream.seek(start)
        remaining_bytes = end - start + 1
        while remaining_bytes > 0:
            bytes_to_read = min(chunk_size, remaining_bytes)
            data = stream.read(bytes_to_read)
            if not data:
                break
            remaining_bytes -= len(data)
            yield data


def _run_ai_pipeline(lecture_id: int) -> None:
    ai_engine = AIEngine.get_instance()

    with Session(engine) as session:
        lecture = session.get(Lecture, lecture_id)
        if not lecture or not lecture.video_path:
            return

        try:
            # 1. Извлечение аудиодорожки
            lecture.status = "extracting_audio"
            session.add(lecture)
            session.commit()
            session.refresh(lecture)

            audio_file = extract_audio(
                video_path=lecture.video_path,
                audio_id=f"lec_{lecture.id}",
            )
            duration = get_video_duration(lecture.video_path)
            lecture.audio_path = str(audio_file)
            lecture.duration = duration
            session.add(lecture)
            session.commit()

            # 2. Транскрибация речи через Faster-Whisper
            lecture.status = "transcribing"
            session.add(lecture)
            session.commit()
            session.refresh(lecture)

            segments = ai_engine.transcribe_audio(
                audio_path=audio_file,
                lecture_id=lecture.id,
            )
            for seg in segments:
                session.add(seg)
            session.commit()

            # 3. Семантическая агрегация и расчет эмбеддингов
            lecture.status = "indexing"
            session.add(lecture)
            session.commit()
            session.refresh(lecture)

            chunks = ai_engine.build_search_chunks(
                segments=segments,
                lecture_id=lecture.id,
                target_duration=35.0,
                overlap=10.0,
            )
            indexed_chunks = ai_engine.compute_chunk_embeddings(chunks)
            for chunk in indexed_chunks:
                session.add(chunk)
            session.commit()

            # 4. Генерация конспекта, глав и глоссария через Ollama/фоллбэк
            lecture.status = "summarizing"
            session.add(lecture)
            session.commit()
            session.refresh(lecture)

            summary_md, chapters, glossary = generate_lecture_artifacts(
                segments=segments,
                lecture_title=lecture.title,
                duration=lecture.duration,
            )

            lecture.summary_markdown = summary_md
            for ch in chapters:
                session.add(
                    LectureChapter(
                        lecture_id=lecture.id,
                        title=ch["title"],
                        start_time=ch["start_time"],
                        summary=ch["summary"],
                    )
                )

            for g in glossary:
                session.add(
                    GlossaryTerm(
                        lecture_id=lecture.id,
                        term=g["term"],
                        definition=g["definition"],
                        first_timecode=g["first_timecode"],
                    )
                )

            lecture.status = "ready"
            lecture.error_message = None
            session.add(lecture)
            session.commit()

        except Exception as exc:
            lecture.status = "error"
            lecture.error_message = str(exc)
            session.add(lecture)
            session.commit()


def process_lecture_pipeline(lecture_id: int) -> None:
    _run_ai_pipeline(lecture_id)


def process_url_pipeline(
    lecture_id: int,
    url: str,
    custom_title: Optional[str] = None,
) -> None:
    with Session(engine) as session:
        lecture = session.get(Lecture, lecture_id)
        if not lecture:
            return

        try:
            video_file, fetched_title, _ = download_video_from_url(
                url=url,
                video_id=f"lec_{lecture.id}",
            )
            lecture.video_path = str(video_file)
            if not custom_title or not custom_title.strip():
                lecture.title = fetched_title
            session.add(lecture)
            session.commit()
        except Exception as exc:
            lecture.status = "error"
            lecture.error_message = str(exc)
            session.add(lecture)
            session.commit()
            return

    _run_ai_pipeline(lecture_id)


def _lecture_to_response(
    lecture: Lecture,
    current_user_id: Optional[int],
    session: Session,
) -> LectureResponse:
    cat_resp = None
    if lecture.category_id:
        c = session.get(Category, lecture.category_id)
        if c:
            cat_resp = CategoryResponse(
                id=c.id or 0,
                name=c.name,
                color=c.color,
                created_at=c.created_at,
                lectures_count=len(c.lectures),
            )

    is_fav = False
    if current_user_id and lecture.id:
        f = session.exec(
            select(UserFavorite).where(
                UserFavorite.user_id == current_user_id,
                UserFavorite.lecture_id == lecture.id,
            )
        ).first()
        is_fav = f is not None

    return LectureResponse(
        id=lecture.id or 0,
        title=lecture.title,
        source_type=lecture.source_type,
        source_url=lecture.source_url,
        video_path=lecture.video_path,
        audio_path=lecture.audio_path,
        duration=lecture.duration,
        status=lecture.status,
        error_message=lecture.error_message,
        summary_markdown=lecture.summary_markdown,
        category_id=lecture.category_id,
        category=cat_resp,
        is_favorite=is_fav,
        created_at=lecture.created_at,
    )


# ================= АУТЕНТИФИКАЦИЯ =================
@app.post("/api/auth/register")
def register_user(
    payload: RegisterRequest,
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Укажите корректный email адрес",
        )
    if len(payload.password.strip()) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль должен содержать минимум 4 символа",
        )
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже зарегистрирован",
        )
    colors = ["blue", "purple", "cyan", "emerald", "amber", "rose"]
    avatar_color = colors[len(email) % len(colors)]

    user = User(
        email=email,
        full_name=payload.full_name.strip() or email.split("@")[0],
        password_hash=hash_password(payload.password),
        avatar_color=avatar_color,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = generate_token()
    session_token = UserSessionToken(user_id=user.id or 0, token=token)
    session.add(session_token)
    session.commit()

    return {
        "user": UserResponse(
            id=user.id or 0,
            email=user.email,
            full_name=user.full_name,
            avatar_color=user.avatar_color,
            created_at=user.created_at,
        ),
        "token": token,
        "favorite_lecture_ids": [],
    }


@app.post("/api/auth/login")
def login_user(
    payload: LoginRequest,
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    email = payload.email.strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )

    token = generate_token()
    session_token = UserSessionToken(user_id=user.id or 0, token=token)
    session.add(session_token)
    session.commit()

    fav_ids = [f.lecture_id for f in user.favorites]

    return {
        "user": UserResponse(
            id=user.id or 0,
            email=user.email,
            full_name=user.full_name,
            avatar_color=user.avatar_color,
            created_at=user.created_at,
        ),
        "token": token,
        "favorite_lecture_ids": fav_ids,
    }


@app.get("/api/auth/me")
def get_me(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    fav_ids = [f.lecture_id for f in user.favorites]
    return {
        "user": UserResponse(
            id=user.id or 0,
            email=user.email,
            full_name=user.full_name,
            avatar_color=user.avatar_color,
            created_at=user.created_at,
        ),
        "favorite_lecture_ids": fav_ids,
    }


@app.post("/api/auth/logout")
def logout_user(
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        st = session.exec(
            select(UserSessionToken).where(UserSessionToken.token == token)
        ).first()
        if st:
            session.delete(st)
            session.commit()
    return {"success": True}


# ================= КАТЕГОРИИ =================
@app.get("/api/categories", response_model=List[CategoryResponse])
def list_categories(session: Session = Depends(get_session)) -> List[CategoryResponse]:
    statement = select(Category).order_by(Category.name.asc())
    categories = list(session.exec(statement).all())
    return [
        CategoryResponse(
            id=c.id or 0,
            name=c.name,
            color=c.color,
            created_at=c.created_at,
            lectures_count=len(c.lectures),
        )
        for c in categories
    ]


@app.post(
    "/api/categories",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    payload: CreateCategoryRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CategoryResponse:
    clean_name = payload.name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Название категории не может быть пустым",
        )
    existing = session.exec(select(Category).where(Category.name == clean_name)).first()
    if existing:
        return CategoryResponse(
            id=existing.id or 0,
            name=existing.name,
            color=existing.color,
            created_at=existing.created_at,
            lectures_count=len(existing.lectures),
        )
    cat = Category(name=clean_name, color=payload.color or "blue")
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return CategoryResponse(
        id=cat.id or 0,
        name=cat.name,
        color=cat.color,
        created_at=cat.created_at,
        lectures_count=0,
    )


@app.put(
    "/api/categories/{id}",
    response_model=CategoryResponse,
)
def update_category(
    id: int,
    payload: UpdateCategoryRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CategoryResponse:
    cat = session.get(Category, id)
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Категория не найдена",
        )
    clean_name = payload.name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Название категории не может быть пустым",
        )
    existing = session.exec(
        select(Category).where(Category.name == clean_name, Category.id != id)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Категория с таким названием уже существует",
        )
    cat.name = clean_name
    if payload.color:
        cat.color = payload.color
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return CategoryResponse(
        id=cat.id or 0,
        name=cat.name,
        color=cat.color,
        created_at=cat.created_at,
        lectures_count=len(cat.lectures),
    )


@app.delete("/api/categories/{id}")
def delete_category(
    id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    cat = session.get(Category, id)
    if not cat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Категория не найдена",
        )
    for lec in cat.lectures:
        lec.category_id = None
        session.add(lec)
    session.delete(cat)
    session.commit()
    return {"success": True, "id": id}


# ================= ИЗБРАННОЕ =================
@app.post("/api/lectures/{id}/favorite")
def toggle_favorite(
    id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    lecture = session.get(Lecture, id)
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Лекция с идентификатором {id} не найдена",
        )
    existing = session.exec(
        select(UserFavorite).where(
            UserFavorite.user_id == user.id,
            UserFavorite.lecture_id == id,
        )
    ).first()
    if existing:
        session.delete(existing)
        session.commit()
        return {"lecture_id": id, "is_favorite": False}
    else:
        fav = UserFavorite(user_id=user.id or 0, lecture_id=id)
        session.add(fav)
        session.commit()
        return {"lecture_id": id, "is_favorite": True}


@app.get("/api/user/favorites", response_model=List[int])
def get_user_favorites(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[int]:
    favs = session.exec(
        select(UserFavorite.lecture_id).where(UserFavorite.user_id == user.id)
    ).all()
    return list(favs)


# ================= УПРАВЛЕНИЕ ЛЕКЦИЯМИ =================
@app.post(
    "/api/lectures/upload",
    response_model=LectureResponse,
    status_code=status.HTTP_201_CREATED,
)
def upload_lecture(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
    category_id: Optional[int] = Form(default=None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LectureResponse:
    original_stem = Path(file.filename or "video").stem
    clean_title = title.strip() if title and title.strip() else original_stem

    lecture = Lecture(
        title=clean_title,
        source_type="file",
        status="uploading",
        category_id=category_id,
    )
    session.add(lecture)
    session.commit()
    session.refresh(lecture)

    try:
        video_path, _ = save_uploaded_video(
            upload_file=file,
            video_id=f"lec_{lecture.id}",
        )
        lecture.video_path = str(video_path)
        session.add(lecture)
        session.commit()
        session.refresh(lecture)
    except Exception as exc:
        lecture.status = "error"
        lecture.error_message = str(exc)
        session.add(lecture)
        session.commit()
        session.refresh(lecture)
        return _lecture_to_response(lecture, user.id, session)

    background_tasks.add_task(process_lecture_pipeline, lecture.id)
    return _lecture_to_response(lecture, user.id, session)


@app.post(
    "/api/lectures/import-url",
    response_model=LectureResponse,
    status_code=status.HTTP_201_CREATED,
)
def import_lecture_url(
    payload: ImportUrlRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LectureResponse:
    clean_title = (
        payload.title.strip()
        if payload.title and payload.title.strip()
        else "Загрузка видео по ссылке..."
    )

    lecture = Lecture(
        title=clean_title,
        source_type="url",
        source_url=payload.url.strip(),
        status="uploading",
        category_id=payload.category_id,
    )
    session.add(lecture)
    session.commit()
    session.refresh(lecture)

    background_tasks.add_task(
        process_url_pipeline,
        lecture.id,
        payload.url.strip(),
        payload.title,
    )
    return _lecture_to_response(lecture, user.id, session)


@app.post(
    "/api/lectures/seed-demo",
    response_model=Lecture,
    status_code=status.HTTP_201_CREATED,
)
def create_demo_lecture(
    session: Session = Depends(get_session),
) -> Lecture:
    return seed_demo_lecture(session)


@app.get("/api/lectures", response_model=List[LectureResponse])
def list_lectures(
    category_id: Optional[int] = Query(default=None),
    only_favorites: bool = Query(default=False),
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
) -> List[LectureResponse]:
    statement = select(Lecture).order_by(Lecture.created_at.desc())
    if category_id is not None:
        statement = statement.where(Lecture.category_id == category_id)

    if only_favorites:
        if not user or not user.id:
            return []
        fav_lecture_ids = session.exec(
            select(UserFavorite.lecture_id).where(UserFavorite.user_id == user.id)
        ).all()
        statement = statement.where(Lecture.id.in_(fav_lecture_ids))

    lectures = list(session.exec(statement).all())
    user_id = user.id if user else None
    return [_lecture_to_response(lec, user_id, session) for lec in lectures]


@app.get("/api/lectures/{id}", response_model=LectureDetailResponse)
def get_lecture(
    id: int,
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
) -> LectureDetailResponse:
    lecture = session.get(Lecture, id)
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Лекция с идентификатором {id} не найдена",
        )

    cat_resp = None
    if lecture.category_id:
        c = session.get(Category, lecture.category_id)
        if c:
            cat_resp = CategoryResponse(
                id=c.id or 0,
                name=c.name,
                color=c.color,
                created_at=c.created_at,
                lectures_count=len(c.lectures),
            )

    is_fav = False
    if user and user.id and lecture.id:
        f = session.exec(
            select(UserFavorite).where(
                UserFavorite.user_id == user.id,
                UserFavorite.lecture_id == lecture.id,
            )
        ).first()
        is_fav = f is not None

    return LectureDetailResponse(
        id=lecture.id or 0,
        title=lecture.title,
        source_type=lecture.source_type,
        source_url=lecture.source_url,
        video_path=lecture.video_path,
        audio_path=lecture.audio_path,
        duration=lecture.duration,
        status=lecture.status,
        error_message=lecture.error_message,
        summary_markdown=lecture.summary_markdown,
        category_id=lecture.category_id,
        category=cat_resp,
        is_favorite=is_fav,
        created_at=lecture.created_at,
        segments=lecture.segments,
        chapters=lecture.chapters,
        glossary_terms=lecture.glossary_terms,
    )


@app.delete("/api/lectures/{id}", response_model=Dict[str, object])
def delete_lecture(
    id: int,
    session: Session = Depends(get_session),
) -> Dict[str, object]:
    lecture = session.get(Lecture, id)
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Лекция с идентификатором {id} не найдена",
        )

    if lecture.video_path:
        Path(lecture.video_path).unlink(missing_ok=True)
    if lecture.audio_path:
        Path(lecture.audio_path).unlink(missing_ok=True)

    session.delete(lecture)
    session.commit()
    return {"success": True, "id": id}


@app.patch("/api/lectures/{id}", response_model=LectureResponse)
def update_lecture(
    id: int,
    payload: UpdateLectureRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LectureResponse:
    lecture = session.get(Lecture, id)
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Лекция с идентификатором {id} не найдена",
        )
    fields_set = payload.model_fields_set
    if "title" in fields_set and payload.title is not None:
        clean_title = payload.title.strip()
        if clean_title:
            lecture.title = clean_title
    if "category_id" in fields_set:
        if payload.category_id is not None and payload.category_id > 0:
            cat = session.get(Category, payload.category_id)
            if not cat:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Указанная категория не найдена",
                )
            lecture.category_id = cat.id
        else:
            lecture.category_id = None
    session.add(lecture)
    session.commit()
    session.refresh(lecture)
    user_id = user.id if user else None
    return _lecture_to_response(lecture, user_id, session)


@app.post("/api/lectures/{id}/retry", response_model=Lecture)
def retry_lecture_processing(
    id: int,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> Lecture:
    lecture = session.get(Lecture, id)
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Лекция с идентификатором {id} не найдена",
        )

    # Очистка предыдущих связанных артефактов при перезапуске конвейера
    for seg in list(lecture.segments):
        session.delete(seg)
    for ch in list(lecture.chapters):
        session.delete(ch)
    for chunk in list(lecture.chunks):
        session.delete(chunk)
    for term in list(lecture.glossary_terms):
        session.delete(term)

    lecture.error_message = None
    lecture.summary_markdown = None

    if lecture.source_url:
        lecture.status = "uploading"
        session.add(lecture)
        session.commit()
        session.refresh(lecture)
        background_tasks.add_task(
            process_url_pipeline,
            lecture.id,
            lecture.source_url,
            lecture.title,
        )
    elif lecture.video_path and resolve_media_path(lecture.video_path, VIDEOS_DIR):
        lecture.status = "extracting_audio"
        session.add(lecture)
        session.commit()
        session.refresh(lecture)
        background_tasks.add_task(process_lecture_pipeline, lecture.id)
    else:
        lecture.status = "error"
        lecture.error_message = "Исходный файл видео отсутствует на диске"
        session.add(lecture)
        session.commit()
        session.refresh(lecture)

    return lecture


@app.post("/api/lectures/{id}/resummarize", response_model=Lecture)
def resummarize_lecture(
    id: int,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_current_user),
) -> Lecture:
    lecture = session.get(Lecture, id)
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Лекция с идентификатором {id} не найдена",
        )
    segments = list(lecture.segments)
    if not segments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Транскрипт лекции отсутствует. Сначала выполните обработку видео.",
        )

    for ch in list(lecture.chapters):
        session.delete(ch)
    for term in list(lecture.glossary_terms):
        session.delete(term)

    summary_md, chapters, glossary = generate_lecture_artifacts(
        segments=segments,
        lecture_title=lecture.title,
        duration=lecture.duration,
    )
    lecture.summary_markdown = summary_md
    for ch in chapters:
        session.add(
            LectureChapter(
                lecture_id=lecture.id,
                title=ch["title"],
                start_time=ch["start_time"],
                summary=ch["summary"],
            )
        )
    for g in glossary:
        session.add(
            GlossaryTerm(
                lecture_id=lecture.id,
                term=g["term"],
                definition=g["definition"],
                first_timecode=g["first_timecode"],
            )
        )
    session.add(lecture)
    session.commit()
    session.refresh(lecture)
    return lecture


@app.get("/api/lectures/{id}/stream")
def stream_lecture_video(
    id: int,
    range_header: Optional[str] = Header(default=None, alias="Range"),
    session: Session = Depends(get_session),
) -> Response:
    lecture = session.get(Lecture, id)
    if not lecture or not lecture.video_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Видеофайл не найден для указанной лекции",
        )

    video_file = resolve_media_path(lecture.video_path, VIDEOS_DIR)
    if not video_file or not video_file.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Файл видео физически отсутствует на сервере",
        )

    video_path = video_file
    file_size = video_path.stat().st_size
    if not range_header:
        return FileResponse(
            path=video_path,
            media_type="video/mp4",
            headers={"Accept-Ranges": "bytes"},
        )

    # Расчет байтовых сдвигов в HTTP Range для мгновенной перемотки видео
    range_match = re.match(r"^bytes=(\d*)-(\d*)$", range_header.strip())
    if not range_match:
        return Response(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    start_raw, end_raw = range_match.groups()
    if not start_raw and not end_raw:
        return Response(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    if start_raw and end_raw:
        start = int(start_raw)
        end = int(end_raw)
    elif start_raw:
        start = int(start_raw)
        end = file_size - 1
    else:
        suffix_length = int(end_raw)
        start = max(0, file_size - suffix_length)
        end = file_size - 1

    if start >= file_size or start > end:
        return Response(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    end = min(end, file_size - 1)
    content_length = end - start + 1

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
        "Content-Type": "video/mp4",
    }

    return StreamingResponse(
        _stream_file_range(video_path, start, end),
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        headers=headers,
    )


@app.get("/api/search")
def search_lectures(
    q: str = Query(..., min_length=1, description="Поисковый запрос"),
    lecture_id: Optional[int] = Query(default=None, description="ID лекции"),
    limit: int = Query(default=10, ge=1, le=50, description="Лимит результатов"),
    session: Session = Depends(get_session),
) -> List[Dict[str, Any]]:
    ai_engine = AIEngine.get_instance()
    return ai_engine.search_semantic(
        query=q,
        session=session,
        lecture_id=lecture_id,
        top_k=limit,
    )


@app.post("/api/lectures/{id}/ask")
def ask_question(
    id: int,
    payload: AskQuestionRequest,
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    lecture = session.get(Lecture, id)
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Лекция с идентификатором {id} не найдена",
        )

    return answer_lecture_question(
        question=payload.question,
        lecture_id=id,
        session=session,
    )


@app.get("/api/system/status")
def get_system_status() -> Dict[str, Any]:
    ai_engine = AIEngine.get_instance()
    hardware_info = ai_engine.get_hardware_info()
    ollama_info = get_ollama_status()

    return {
        "status": "online",
        "gpu": {
            "available": hardware_info["cuda_available"],
            "name": hardware_info["device_name"],
            "device": hardware_info["device"],
            "compute_type": hardware_info["compute_type"],
        },
        "whisper": {
            "model": "small",
            "loaded": hardware_info["whisper_loaded"],
        },
        "embeddings": {
            "model": "paraphrase-multilingual-MiniLM-L12-v2",
            "loaded": hardware_info["embeddings_loaded"],
        },
        "ollama": ollama_info,
    }


@app.get("/favicon.ico", include_in_schema=False)
def get_favicon() -> Response:
    for candidate in [
        ROOT_DIR / "frontend" / "dist" / "favicon.svg",
        ROOT_DIR / "frontend" / "public" / "favicon.svg",
    ]:
        if candidate.is_file():
            return FileResponse(candidate, media_type="image/svg+xml")
    return Response(status_code=204)


# Раздача собранного SPA-фронтенда для автономной работы без dev-сервера Node.js
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST_DIR.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="static")
