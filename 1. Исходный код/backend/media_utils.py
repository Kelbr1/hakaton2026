import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Optional, Tuple, Union

import yt_dlp
from fastapi import UploadFile

BASE_DIR: Path = Path(__file__).resolve().parent
STORAGE_DIR: Path = BASE_DIR / "storage"
VIDEOS_DIR: Path = STORAGE_DIR / "videos"
AUDIO_DIR: Path = STORAGE_DIR / "audio"
THUMBNAILS_DIR: Path = STORAGE_DIR / "thumbnails"

VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)


def resolve_media_path(
    raw_path: Optional[Union[str, Path]],
    default_dir: Path,
) -> Optional[Path]:
    if not raw_path:
        return None
    p = Path(raw_path)
    if p.is_file():
        return p
    in_root = BASE_DIR.parent / raw_path
    if in_root.is_file():
        return in_root
    in_default = default_dir / p.name
    if in_default.is_file():
        return in_default
    return None


def _resolve_binary(name: str) -> Optional[str]:
    in_path = shutil.which(name)
    if in_path:
        return in_path

    env_var = os.environ.get(f"{name.upper()}_PATH")
    if env_var and Path(env_var).is_file():
        return env_var

    if name == "ffmpeg":
        try:
            import imageio_ffmpeg

            return imageio_ffmpeg.get_ffmpeg_exe()
        except (ImportError, RuntimeError):
            pass

    return None


def get_ffmpeg_path() -> str:
    path = _resolve_binary("ffmpeg")
    if not path:
        raise FileNotFoundError(
            "FFmpeg не найден. Установите FFmpeg или настройте FFMPEG_PATH."
        )
    return path


def get_ffprobe_path() -> Optional[str]:
    return _resolve_binary("ffprobe")


def save_uploaded_video(
    upload_file: UploadFile,
    video_id: Optional[str] = None,
) -> Tuple[Path, str]:
    if not video_id:
        video_id = uuid.uuid4().hex

    target_path = VIDEOS_DIR / f"{video_id}.mp4"

    upload_file.file.seek(0)
    with target_path.open("wb") as out_file:
        while chunk := upload_file.file.read(1024 * 1024):
            out_file.write(chunk)

    return target_path, video_id


def download_video_from_url(
    url: str,
    video_id: Optional[str] = None,
) -> Tuple[Path, str, str]:
    if not video_id:
        video_id = uuid.uuid4().hex

    template_path = str(VIDEOS_DIR / f"{video_id}.%(ext)s")
    target_mp4 = VIDEOS_DIR / f"{video_id}.mp4"

    ydl_opts = {
        "outtmpl": template_path,
        "format": (
            "best[height<=720][ext=mp4]/best[ext=mp4]/"
            "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/"
            "best"
        ),
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }

    ffmpeg_bin = _resolve_binary("ffmpeg")
    if ffmpeg_bin:
        ydl_opts["ffmpeg_location"] = ffmpeg_bin

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info_dict = ydl.extract_info(url, download=True)
        title = (
            info_dict.get("title")
            if info_dict and info_dict.get("title")
            else "Загруженная лекция"
        )

    if target_mp4.is_file():
        return target_mp4, title, video_id

    matched_files = list(VIDEOS_DIR.glob(f"{video_id}.*"))
    if not matched_files:
        raise FileNotFoundError(f"Файл видео не был скачан для URL: {url}")

    downloaded_file = matched_files[0]
    if downloaded_file.suffix.lower() != ".mp4" and ffmpeg_bin:
        # Перекодирование/перепаковка в MP4 для единого формата контейнера
        remux_cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            str(downloaded_file),
            "-c",
            "copy",
            str(target_mp4),
        ]
        proc = subprocess.run(
            remux_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        if proc.returncode == 0 and target_mp4.is_file():
            downloaded_file.unlink(missing_ok=True)
            return target_mp4, title, video_id

    return downloaded_file, title, video_id


def extract_audio(
    video_path: Union[str, Path],
    audio_id: Optional[str] = None,
) -> Path:
    video_file = resolve_media_path(video_path, VIDEOS_DIR)
    if not video_file or not video_file.is_file():
        raise FileNotFoundError(f"Видеофайл не найден: {video_path}")

    if not audio_id:
        audio_id = video_file.stem

    output_audio = AUDIO_DIR / f"{audio_id}.wav"
    ffmpeg_bin = get_ffmpeg_path()

    # Запуск FFmpeg для извлечения 16kHz mono WAV без сжатия под требования Whisper
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i",
        str(video_file),
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        str(output_audio),
    ]

    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        error_msg = result.stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"Ошибка при извлечении аудио: {error_msg}")

    return output_audio


def get_video_duration(video_path: Union[str, Path]) -> float:
    video_file = resolve_media_path(video_path, VIDEOS_DIR)
    if not video_file or not video_file.is_file():
        raise FileNotFoundError(f"Видеофайл не найден: {video_path}")

    ffprobe_bin = get_ffprobe_path()
    if ffprobe_bin:
        cmd = [
            ffprobe_bin,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_file),
        ]
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if result.returncode == 0 and result.stdout.strip():
            try:
                return float(result.stdout.strip())
            except ValueError:
                pass

    # Фоллбэк: парсинг заголовка Duration через FFmpeg stderr при отсутствии ffprobe
    ffmpeg_bin = get_ffmpeg_path()
    cmd = [ffmpeg_bin, "-i", str(video_file)]
    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    duration_match = re.search(
        r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)",
        result.stderr,
    )
    if duration_match:
        hours = float(duration_match.group(1))
        minutes = float(duration_match.group(2))
        seconds = float(duration_match.group(3))
        return hours * 3600.0 + minutes * 60.0 + seconds

    return 0.0


def generate_thumbnail(
    video_path: Union[str, Path],
    thumbnail_id: Optional[str] = None,
    duration: Optional[float] = None,
    time_offset: Optional[float] = None,
) -> Optional[Path]:
    video_file = resolve_media_path(video_path, VIDEOS_DIR)
    if not video_file or not video_file.is_file():
        return None

    if not thumbnail_id:
        thumbnail_id = video_file.stem

    output_thumbnail = THUMBNAILS_DIR / f"{thumbnail_id}.jpg"
    try:
        ffmpeg_bin = get_ffmpeg_path()
    except FileNotFoundError:
        return None

    if time_offset is None:
        if duration is None or duration <= 0:
            try:
                duration = get_video_duration(video_file)
            except Exception:
                duration = 0.0

        if duration and duration > 10.0:
            time_offset = min(5.0, duration * 0.1)
        elif duration and duration > 2.0:
            time_offset = 1.0
        else:
            time_offset = 0.0

    cmd = [
        ffmpeg_bin,
        "-y",
        "-ss",
        f"{time_offset:.2f}",
        "-i",
        str(video_file),
        "-vframes",
        "1",
        "-q:v",
        "2",
        "-vf",
        "scale=640:-1",
        str(output_thumbnail),
    ]

    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if (
        result.returncode == 0
        and output_thumbnail.is_file()
        and output_thumbnail.stat().st_size > 0
    ):
        return output_thumbnail

    fallback_cmd = [
        ffmpeg_bin,
        "-y",
        "-ss",
        "00:00:00",
        "-i",
        str(video_file),
        "-vframes",
        "1",
        "-q:v",
        "2",
        "-vf",
        "scale=640:-1",
        str(output_thumbnail),
    ]
    fb_res = subprocess.run(
        fallback_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if (
        fb_res.returncode == 0
        and output_thumbnail.is_file()
        and output_thumbnail.stat().st_size > 0
    ):
        return output_thumbnail

    return None

