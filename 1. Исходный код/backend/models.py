import hashlib
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator, List, Optional

from pydantic import BaseModel
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Field, Relationship, Session, SQLModel, create_engine

DB_PATH: Path = Path(__file__).resolve().parent / "database.db"
DATABASE_URL: str = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection: Any, connection_record: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return salt.hex() + ":" + key.hex()


def verify_password(password: str, hashed: str) -> bool:
    try:
        salt_hex, key_hex = hashed.split(":")
        salt = bytes.fromhex(salt_hex)
        key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
        return key.hex() == key_hex
    except Exception:
        return False


def generate_token() -> str:
    return secrets.token_urlsafe(32)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str
    password_hash: str
    avatar_color: str = Field(default="blue")
    created_at: datetime = Field(default_factory=get_utc_now)

    sessions: List["UserSessionToken"] = Relationship(
        back_populates="user",
        cascade_delete=True,
    )
    favorites: List["UserFavorite"] = Relationship(
        back_populates="user",
        cascade_delete=True,
    )
    notes: List["LectureNote"] = Relationship(
        back_populates="user",
        cascade_delete=True,
    )


class UserSessionToken(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    token: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=get_utc_now)

    user: Optional[User] = Relationship(back_populates="sessions")


class Category(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    color: str = Field(default="blue")
    created_at: datetime = Field(default_factory=get_utc_now)

    lectures: List["Lecture"] = Relationship(back_populates="category")


class UserFavorite(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    lecture_id: int = Field(foreign_key="lecture.id", index=True)
    created_at: datetime = Field(default_factory=get_utc_now)

    user: Optional[User] = Relationship(back_populates="favorites")
    lecture: Optional["Lecture"] = Relationship(back_populates="favorited_by")


class LectureBase(SQLModel):
    title: str
    source_type: str = Field(description="'file' or 'url'")
    source_url: Optional[str] = None
    video_path: Optional[str] = None
    audio_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    duration: float = Field(default=0.0)
    status: str = Field(default="uploading")
    error_message: Optional[str] = None
    summary_markdown: Optional[str] = None
    category_id: Optional[int] = Field(default=None, foreign_key="category.id")


class Lecture(LectureBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=get_utc_now)

    category: Optional[Category] = Relationship(back_populates="lectures")
    favorited_by: List[UserFavorite] = Relationship(
        back_populates="lecture",
        cascade_delete=True,
    )
    segments: List["TranscriptSegment"] = Relationship(
        back_populates="lecture",
        cascade_delete=True,
    )
    chunks: List["SearchChunk"] = Relationship(
        back_populates="lecture",
        cascade_delete=True,
    )
    chapters: List["LectureChapter"] = Relationship(
        back_populates="lecture",
        cascade_delete=True,
    )
    glossary_terms: List["GlossaryTerm"] = Relationship(
        back_populates="lecture",
        cascade_delete=True,
    )
    notes: List["LectureNote"] = Relationship(
        back_populates="lecture",
        cascade_delete=True,
    )


class TranscriptSegment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lecture_id: int = Field(foreign_key="lecture.id", index=True)
    start_time: float
    end_time: float
    text: str

    lecture: Optional[Lecture] = Relationship(back_populates="segments")


class SearchChunk(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lecture_id: int = Field(foreign_key="lecture.id", index=True)
    start_time: float
    end_time: float
    text: str
    embedding_json: str

    lecture: Optional[Lecture] = Relationship(back_populates="chunks")


class LectureChapter(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lecture_id: int = Field(foreign_key="lecture.id", index=True)
    title: str
    start_time: float
    summary: str

    lecture: Optional[Lecture] = Relationship(back_populates="chapters")


class GlossaryTerm(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lecture_id: int = Field(foreign_key="lecture.id", index=True)
    term: str
    definition: str
    first_timecode: float

    lecture: Optional[Lecture] = Relationship(back_populates="glossary_terms")


class LectureNote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    lecture_id: int = Field(foreign_key="lecture.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    timecode: float
    text: str
    created_at: datetime = Field(default_factory=get_utc_now)

    lecture: Optional[Lecture] = Relationship(back_populates="notes")
    user: Optional[User] = Relationship(back_populates="notes")


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    avatar_color: str
    created_at: datetime


class CategoryResponse(BaseModel):
    id: int
    name: str
    color: str
    created_at: datetime
    lectures_count: int = 0


class LectureResponse(BaseModel):
    id: int
    title: str
    source_type: str
    source_url: Optional[str] = None
    video_path: Optional[str] = None
    audio_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    duration: float
    status: str
    error_message: Optional[str] = None
    summary_markdown: Optional[str] = None
    category_id: Optional[int] = None
    category: Optional[CategoryResponse] = None
    is_favorite: bool = False
    created_at: datetime


class LectureDetailResponse(BaseModel):
    id: int
    title: str
    source_type: str
    source_url: Optional[str] = None
    video_path: Optional[str] = None
    audio_path: Optional[str] = None
    thumbnail_path: Optional[str] = None
    duration: float
    status: str
    error_message: Optional[str] = None
    summary_markdown: Optional[str] = None
    category_id: Optional[int] = None
    category: Optional[CategoryResponse] = None
    created_at: datetime
    is_favorite: bool = False
    segments: List[TranscriptSegment] = []
    chapters: List[LectureChapter] = []
    glossary_terms: List[GlossaryTerm] = []


class ImportUrlRequest(BaseModel):
    url: str
    title: Optional[str] = None
    category_id: Optional[int] = None


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class CreateCategoryRequest(BaseModel):
    name: str
    color: Optional[str] = "blue"


class UpdateCategoryRequest(BaseModel):
    name: str
    color: Optional[str] = None


class UpdateLectureRequest(BaseModel):
    title: Optional[str] = None
    category_id: Optional[int] = None


class CreateNoteRequest(BaseModel):
    timecode: float
    text: str


class UpdateNoteRequest(BaseModel):
    text: str


class LectureNoteResponse(BaseModel):
    id: int
    lecture_id: int
    user_id: Optional[int] = None
    timecode: float
    text: str
    created_at: datetime


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)

    # Проверка и добавление колонок в таблицу lecture при необходимости
    with engine.connect() as conn:
        try:
            cursor = conn.exec_driver_sql("PRAGMA table_info(lecture)")
            cols = [row[1] for row in cursor.fetchall()]
            if "category_id" not in cols:
                conn.exec_driver_sql(
                    "ALTER TABLE lecture ADD COLUMN category_id "
                    "INTEGER REFERENCES category(id)"
                )
                conn.commit()
            if "thumbnail_path" not in cols:
                conn.exec_driver_sql(
                    "ALTER TABLE lecture ADD COLUMN thumbnail_path "
                    "VARCHAR"
                )
                conn.commit()
        except Exception:
            pass

    # Автоматическая генерация превью для существующих лекций
    try:
        from .media_utils import THUMBNAILS_DIR, generate_thumbnail
        with Session(engine) as session:
            from sqlmodel import select
            lecs = session.exec(select(Lecture)).all()
            for lec in lecs:
                needs_update = False
                thumb_file = THUMBNAILS_DIR / f"lec_{lec.id}.jpg"
                if not thumb_file.is_file() and lec.video_path:
                    created = generate_thumbnail(
                        video_path=lec.video_path,
                        thumbnail_id=f"lec_{lec.id}",
                        duration=lec.duration,
                    )
                    if created and created.is_file():
                        thumb_file = created
                        needs_update = True
                if thumb_file.is_file() and not lec.thumbnail_path:
                    lec.thumbnail_path = f"backend/storage/thumbnails/{thumb_file.name}"
                    needs_update = True
                if needs_update:
                    session.add(lec)
            session.commit()
    except Exception:
        pass

    # Инициализация базовых категорий
    with Session(engine) as session:
        from sqlmodel import select

        existing = session.exec(select(Category)).first()
        if not existing:
            default_categories = [
                Category(name="Математика", color="cyan"),
                Category(name="Нейросети", color="purple"),
                Category(name="Физика", color="blue"),
                Category(name="Инженерия", color="emerald"),
            ]
            for cat in default_categories:
                session.add(cat)
            session.commit()
