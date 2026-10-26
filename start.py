import shutil
import signal
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"
DIST_DIR = FRONTEND_DIR / "dist"


def check_dependencies() -> None:
    required = [
        ("fastapi", "fastapi"),
        ("uvicorn", "uvicorn"),
        ("sqlmodel", "sqlmodel"),
        ("faster_whisper", "faster-whisper"),
        ("fastembed", "fastembed"),
        ("soundfile", "soundfile"),
        ("imageio_ffmpeg", "imageio-ffmpeg"),
        ("yt_dlp", "yt-dlp"),
    ]
    missing = []
    for mod, pkg in required:
        try:
            __import__(mod)
        except ImportError:
            missing.append(pkg)

    if missing:
        print(f"[Установка] Обнаружены отсутствующие пакеты: {', '.join(missing)}")
        print("Автоматическая установка зависимостей из backend/requirements.txt...")
        cmd = [
            sys.executable,
            "-m",
            "pip",
            "install",
            "-r",
            str(ROOT_DIR / "backend" / "requirements.txt"),
        ]
        res = subprocess.run(cmd)
        if res.returncode != 0:
            print("[Внимание] Не удалось установить некоторые пакеты. Продолжаем запуск...")


def main() -> None:
    print("=" * 65)
    print("  Киберрывок 2026: Семантический поиск по видеолекциям")
    print("=" * 65)
    print()

    # 0. Быстрая проверка пакетов
    check_dependencies()

    # 1. Запуск Backend (FastAPI + Uvicorn)
    print("[1/2] Запуск сервера на http://127.0.0.1:8000...")
    backend_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "backend.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
        "--reload",
    ]
    backend_proc = subprocess.Popen(
        backend_cmd,
        cwd=str(ROOT_DIR),
    )

    # 2. Определение режима фронтенда (Dev Vite или Предсобранный SPA)
    has_npm = shutil.which("npm") is not None
    has_node_modules = (FRONTEND_DIR / "node_modules").is_dir()
    frontend_proc = None
    open_url = "http://127.0.0.1:8000"

    if has_npm and has_node_modules:
        print("[2/2] Запуск фронтенда (Vite Dev Server) на http://localhost:5173...")
        npm_cmd = (
            ["cmd.exe", "/c", "npm", "run", "dev"]
            if sys.platform == "win32"
            else ["npm", "run", "dev"]
        )
        try:
            frontend_proc = subprocess.Popen(
                npm_cmd,
                cwd=str(FRONTEND_DIR),
            )
            open_url = "http://localhost:5173"
        except Exception as e:
            print(f"[Инфо] Ошибка запуска Vite ({e}). Используется автономный режим: http://127.0.0.1:8000")
            open_url = "http://127.0.0.1:8000"
    else:
        print("[2/2] Node.js/npm не задействован. Запущен автономный веб-интерфейс на http://127.0.0.1:8000")
        open_url = "http://127.0.0.1:8000"

    # 3. Открытие в браузере
    time.sleep(2.0)
    print(f"\nОткрытие веб-интерфейса в браузере: {open_url}")
    try:
        webbrowser.open(open_url)
    except Exception:
        pass

    print()
    print("=" * 65)
    print("  Сервисы успешно запущены! Нажмите Ctrl+C для выхода.")
    print("  • Веб-интерфейс: " + open_url)
    print("  • Swagger API:   http://127.0.0.1:8000/docs")
    print("=" * 65)
    print()

    try:
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None:
                print("Сервер бэкенда завершил работу.")
                break
            if frontend_proc and frontend_proc.poll() is not None:
                print("Процесс фронтенда завершил работу.")
                break
    except KeyboardInterrupt:
        print("\nОстановка сервисов...")
    finally:
        for proc in (backend_proc, frontend_proc):
            if proc and proc.poll() is None:
                try:
                    if sys.platform == "win32":
                        subprocess.run(
                            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                        )
                    else:
                        proc.send_signal(signal.SIGINT)
                except Exception:
                    pass


if __name__ == "__main__":
    main()
