#!/bin/bash

# Скрипт для запуска сервера Eye Trajectory Recording

# Активация виртуального окружения, если оно существует
if [ -d "venv" ]; then
    echo "Активирую виртуальное окружение..."
    source venv/bin/activate
fi

# Проверка наличия необходимых пакетов
echo "Проверяю зависимости..."
python -c "import fastapi, uvicorn" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Ошибка: не установлены необходимые пакеты (fastapi, uvicorn)"
    echo "Установите их командой: pip install -r requirements.txt"
    exit 1
fi

# Запуск сервера
echo "Запускаю сервер на http://localhost:8000"
echo "Документация API: http://localhost:8000/docs"
echo "Веб-интерфейс: http://localhost:8000/"
echo ""
echo "Для остановки нажмите Ctrl+C"
echo ""

python server_stub_http.py

