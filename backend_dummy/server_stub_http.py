# server_stub_http.py
import os
import json
import datetime
import math
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Eye Trajectory Recording App", description="Веб-приложение для записи траектории движения глаз")

# CORS - разрешаем все origins для веб-приложения
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # в проде лучше ограничить конкретными доменами
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Создаем необходимые директории
os.makedirs("video_data", exist_ok=True)
os.makedirs("traj_data", exist_ok=True)
os.makedirs("static", exist_ok=True)


# ==================== API эндпоинты ====================

# Модели для запроса траектории
class Coefficient(BaseModel):
    amplitude: float
    frequency: float
    phase: float


class TrajectoryRequest(BaseModel):
    num_points: int = 100
    time_range: float = 6.283185307179586
    num_coefficients: int = 5
    base_amplitude: float = 1
    coefficients: List[Coefficient] = []


@app.post("/api/get_trajectory")
async def get_trajectory(
    request: TrajectoryRequest,
    token: Optional[str] = Query(None, description="Токен пользователя (опционально)")
):
    """
    Генерирует траекторию на основе параметров запроса.
    Траектория представляет собой набор точек в диапазоне [-1, 1] по обеим осям.
    
    Args:
        request: Параметры для генерации траектории
        token: Токен пользователя (для будущей авторизации)
    """
    # В будущем здесь можно добавить проверку токена
    if token:
        print(f"Запрос траектории от пользователя с токеном: {token[:10]}...")
    
    num_points = request.num_points
    time_range = request.time_range
    base_amplitude = request.base_amplitude
    coefficients = request.coefficients if request.coefficients else [
        Coefficient(amplitude=1, frequency=3, phase=2)
    ]
    
    trajectory = []
    
    for i in range(num_points):
        t = (i / (num_points - 1)) * time_range if num_points > 1 else 0
        
        # Вычисляем x и y используя коэффициенты
        x = base_amplitude * math.cos(t)
        y = base_amplitude * math.sin(t)
        
        # Добавляем гармоники из coefficients
        for coeff in coefficients:
            x += coeff.amplitude * math.cos(coeff.frequency * t + coeff.phase)
            y += coeff.amplitude * math.sin(coeff.frequency * t + coeff.phase)
        
        # Нормализуем в диапазон [-1, 1]
        max_val = base_amplitude + sum(c.amplitude for c in coefficients)
        if max_val > 0:
            x = max(-1, min(1, x / max_val))
            y = max(-1, min(1, y / max_val))
        
        trajectory.append({"x": x, "y": y})
    
    return {"trajectory": trajectory}


@app.post("/api/analyze")
async def analyze(
    video: UploadFile = File(...),
    trajectory: str = Form(...),
    token: Optional[str] = Form(None)
):
    """
    Принимает видео и траекторию для сохранения на сервере.
    
    Args:
        video: Видеофайл (webm формат)
        trajectory: JSON строка с массивом точек траектории
        token: Токен пользователя (опционально)
    """
    # В будущем здесь можно добавить проверку токена
    if token:
        print(f"Загрузка видео от пользователя с токеном: {token[:10]}...")
    
    # Таймштамп для уникальных имен файлов
    timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")

    # Сохраняем видео
    video_filename = f"{timestamp}_{video.filename}"
    video_path = os.path.join("video_data", video_filename)
    with open(video_path, "wb") as f:
        content = await video.read()
        f.write(content)
    
    print(f"Видео сохранено: {video_path} ({len(content)} байт)")

    # Сохраняем траекторию
    try:
        traj_obj = json.loads(trajectory)
    except json.JSONDecodeError:
        # Даже если JSON битый — всё равно возвращаем "успех",
        # но сохраняем сырой текст
        traj_obj = None

    traj_filename = f"{timestamp}_trajectory.json"
    traj_path = os.path.join("traj_data", traj_filename)

    with open(traj_path, "w", encoding="utf-8") as f:
        if traj_obj is None:
            f.write(trajectory)
        else:
            json.dump(traj_obj, f, ensure_ascii=False, indent=2)
    
    print(f"Траектория сохранена: {traj_path}")

    return {"status": "success", "video_file": video_filename, "trajectory_file": traj_filename}


@app.get("/api/health")
async def health_check():
    """Проверка здоровья сервера"""
    return {
        "status": "ok",
        "timestamp": datetime.datetime.utcnow().isoformat()
    }


# ==================== Веб-приложение ====================

@app.get("/app", response_class=HTMLResponse)
@app.get("/", response_class=HTMLResponse)
async def app_root(request: Request, token: Optional[str] = Query(None)):
    """
    Главная страница веб-приложения.
    Поддерживает параметр token в URL для идентификации пользователя.
    """
    index_path = Path("../webview/index.html")
    
    if not index_path.exists():
        raise HTTPException(
            status_code=500,
            detail="Веб-приложение не найдено. Убедитесь, что файл ../webview/index.html существует."
        )
    
    # Читаем HTML и подставляем токен если он есть
    with open(index_path, "r", encoding="utf-8") as f:
        html_content = f.read()
    
    # Если есть токен, добавляем его в скрипт как глобальную переменную
    if token:
        script_tag = f'<script>window.APP_TOKEN = "{token}";</script>'
        # Вставляем перед закрывающим тегом </head>
        html_content = html_content.replace("</head>", f"{script_tag}\n</head>")
    
    return HTMLResponse(content=html_content)


# Для обратной совместимости - редирект старых URL
@app.get("/webview_server.html")
async def old_webview():
    """Редирект на новое приложение"""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/app", status_code=301)


# Монтируем статические файлы для веб-приложения
# Важно: монтировать ПОСЛЕ всех API роутов
static_path = Path("../webview")
if static_path.exists():
    app.mount("", StaticFiles(directory="../webview"), name="static")


if __name__ == "__main__":
    host = os.environ.get("APP_HOST", "0.0.0.0")
    port = int(os.environ.get("APP_PORT", "8000"))

    print(f"Launching HTTP server on {host}:{port}")
    
    uvicorn.run(
        "server_stub_http:app",
        host=host,
        port=port,
        reload=True
    )

