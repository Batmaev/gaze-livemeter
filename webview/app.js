/**
 * Веб-приложение для записи траектории движения глаз
 * Автоматический запуск с обучающим экраном
 */

// Конфигурация API - используем относительные пути
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:8000' : window.location.origin;
const API_ENDPOINTS = {
    GET_TRAJECTORY: `${API_BASE}/api/get_trajectory`,
    ANALYZE: `${API_BASE}/api/analyze`,
    HEALTH: `${API_BASE}/api/health`
};

// Получаем токен из глобальной переменной или URL
const getToken = () => {
    if (window.APP_TOKEN) {
        return window.APP_TOKEN;
    }
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token') || null;
};

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// Элементы DOM
let canvas, ctx, instructionScreen;

// Состояние приложения
let trajectoryPoints = [];
let animationStartTime = null;
let animationRequestId = null;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecordingComplete = false;

const ANIMATION_DURATION = 5000; // 5 секунд
const INSTRUCTION_DURATION = 3000; // 3 секунды обучающего экрана
const MARGIN = 20; // Отступ от краев экрана в пикселях

// Параметры траектории по умолчанию
const defaultPayload = {
    num_points: 100,
    time_range: 6.283185307179586,
    num_coefficients: 5,
    base_amplitude: 1,
    coefficients: [
        {
            amplitude: 1,
            frequency: 3,
            phase: 2
        }
    ]
};

/**
 * Инициализация приложения
 */
function initApp() {
    canvas = document.getElementById('trajectoryCanvas');
    ctx = canvas.getContext('2d');
    instructionScreen = document.getElementById('instructionScreen');

    if (!canvas || !instructionScreen) {
        console.error('Не найдены необходимые DOM элементы');
        return;
    }

    // Устанавливаем размер canvas на основе размера экрана
    resizeCanvas();

    // Обработка изменения размера окна
    window.addEventListener('resize', resizeCanvas);

    // Автоматически запускаем процесс
    startAll();
}

/**
 * Установка размера canvas на основе размера экрана
 */
function resizeCanvas() {
    const width = window.innerWidth - MARGIN * 2;
    const height = window.innerHeight - MARGIN * 2;
    
    canvas.width = width;
    canvas.height = height;
    
    // Перерисовываем если траектория уже загружена
    if (trajectoryPoints.length > 0) {
        drawFullTrajectoryPreview();
    }
}

/**
 * Основная функция запуска записи
 */
async function startAll() {
    try {
        // 1. Загружаем траекторию
        await loadTrajectory();

        // 2. Рисуем полную траекторию на canvas (будет видна в превью)
        drawFullTrajectoryPreview();

        // 3. Показываем обучающий экран с точкой начала траектории
        showInstructionScreen();

        // 3. Ждем 3 секунды, затем запускаем запись и анимацию
        setTimeout(() => {
            hideInstructionScreen();
            startRecordingAndAnimation();
        }, INSTRUCTION_DURATION);

    } catch (e) {
        console.error(e);
        alert('Ошибка: ' + e.message);
    }
}

/**
 * Показ обучающего экрана
 */
function showInstructionScreen() {
    if (!instructionScreen) return;

    // Показываем экран (canvas с траекторией уже виден за ним)
    instructionScreen.classList.remove('hidden');
}

/**
 * Скрытие обучающего экрана
 */
function hideInstructionScreen() {
    if (instructionScreen) {
        instructionScreen.classList.add('hidden');
    }
}

/**
 * Запуск записи и анимации
 */
async function startRecordingAndAnimation() {
    try {
        // 1. Запрос доступа к фронтальной камере
        await requestCameraAccess();

        // 2. Настройка медиарекордера
        setupMediaRecorder();

        // 3. Запуск записи
        mediaRecorder.start();

        // 4. Запуск анимации
        animationStartTime = null;
        animationRequestId = requestAnimationFrame(animateOnce);
    } catch (e) {
        console.error(e);
        alert('Ошибка при запуске записи: ' + e.message);
    }
}

/**
 * Запрос доступа к камере
 */
async function requestCameraAccess() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Доступ к камере не поддерживается этим браузером.');
    }

    const isSecureContext = window.isSecureContext || 
                           window.location.protocol === 'https:' || 
                           window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1';

    if (!isSecureContext && navigator.getUserMedia) {
        // Используем legacy API для HTTP контекста
        const getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia;
        
        mediaStream = await new Promise((resolve, reject) => {
            getUserMedia.call(navigator, {
                video: { facingMode: 'user' },
                audio: false
            }, resolve, reject);
        });
    } else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Используем стандартный API
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false
            });
        } catch (error) {
            // Fallback на legacy API
            if (navigator.getUserMedia || navigator.mozGetUserMedia) {
                const getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia;
                mediaStream = await new Promise((resolve, reject) => {
                    getUserMedia.call(navigator, {
                        video: { facingMode: 'user' },
                        audio: false
                    }, resolve, reject);
                });
            } else {
                throw error;
            }
        }
    } else {
        throw new Error('Доступ к камере недоступен.');
    }
}

/**
 * Настройка медиарекордера
 */
function setupMediaRecorder() {
    recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm') 
            ? 'video/webm'
            : 'video/mp4';
    
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = handleStopRecording;
}

/**
 * Загрузка траектории с сервера
 */
async function loadTrajectory() {
    const token = getToken();
    const url = token 
        ? `${API_ENDPOINTS.GET_TRAJECTORY}?token=${encodeURIComponent(token)}`
        : API_ENDPOINTS.GET_TRAJECTORY;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(defaultPayload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data.trajectory || !Array.isArray(data.trajectory)) {
        throw new Error('Некорректный формат ответа траектории');
    }

    trajectoryPoints = data.trajectory;
}

/**
 * Анимация один раз: 0..1 за ANIMATION_DURATION, потом стоп
 */
function animateOnce(timestamp) {
    if (!trajectoryPoints.length) {
        stopRecordingIfNeeded();
        return;
    }

    if (animationStartTime === null) {
        animationStartTime = timestamp;
    }

    const elapsed = timestamp - animationStartTime;
    let t = elapsed / ANIMATION_DURATION; // 0..1+

    if (t >= 1) {
        t = 1;
        drawFrame(t);
        stopRecordingIfNeeded();
        return;
    }

    drawFrame(t);
    animationRequestId = requestAnimationFrame(animateOnce);
}

/**
 * Остановка записи
 */
function stopRecordingIfNeeded() {
    if (animationRequestId) {
        cancelAnimationFrame(animationRequestId);
        animationRequestId = null;
    }

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop(); // вызовет handleStopRecording
    } else {
        stopMediaStream();
    }
}

/**
 * Обработка остановки записи
 */
async function handleStopRecording() {
    // Останавливаем камеру
    stopMediaStream();

    if (!recordedChunks.length) {
        isRecordingComplete = true;
        notifyComplete();
        return;
    }

    const blob = new Blob(recordedChunks, { type: 'video/webm' });

    try {
        await sendVideoAndTrajectory(blob, trajectoryPoints);
        isRecordingComplete = true;
        
        // Уведомляем о завершении
        setTimeout(() => {
            notifyComplete();
        }, 500);
    } catch (e) {
        console.error(e);
        // Все равно уведомляем о завершении
        isRecordingComplete = true;
        setTimeout(() => {
            notifyComplete();
        }, 2000);
    }
}

/**
 * Остановка медиа потока
 */
function stopMediaStream() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
}

/**
 * Отправка видео и траектории на сервер
 */
async function sendVideoAndTrajectory(videoBlob, trajectory) {
    const token = getToken();
    const formData = new FormData();
    formData.append('video', videoBlob, 'trajectory_recording.webm');
    formData.append('trajectory', JSON.stringify(trajectory));
    
    if (token) {
        formData.append('token', token);
    }

    const response = await fetch(API_ENDPOINTS.ANALYZE, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const json = await response.json();
    if (json.status !== 'success') {
        throw new Error('Сервер вернул неуспех: ' + JSON.stringify(json));
    }

    return json;
}

/**
 * Уведомление о завершении (для интеграции с нативными приложениями)
 */
function notifyComplete() {
    // Опциональная интеграция с iOS WebKit
    if (typeof webkit !== 'undefined' && webkit.messageHandlers && webkit.messageHandlers.recordingComplete) {
        try {
            webkit.messageHandlers.recordingComplete.postMessage('done');
        } catch (e) {
            console.log('iOS message handler not available:', e);
        }
    }
    
    // Опциональная интеграция с Android
    if (typeof Android !== 'undefined' && Android.onRecordingComplete) {
        try {
            Android.onRecordingComplete('done');
        } catch (e) {
            console.log('Android interface not available:', e);
        }
    }
}

/**
 * Рисуем полную траекторию для превью с красной точкой в начале
 */
function drawFullTrajectoryPreview() {
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    // Масштабируем траекторию по всей ширине и высоте с отступами
    const scaleX = (width - MARGIN * 2) / 2;
    const scaleY = (height - MARGIN * 2) / 2;

    // Полная траектория
    if (trajectoryPoints.length > 0) {
        ctx.beginPath();
        let p = toCanvasCoords(trajectoryPoints[0], cx, cy, scaleX, scaleY);
        ctx.moveTo(p.x, p.y);
        for (let i = 1; i < trajectoryPoints.length; i++) {
            p = toCanvasCoords(trajectoryPoints[i], cx, cy, scaleX, scaleY);
            ctx.lineTo(p.x, p.y);
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0066cc';
        ctx.stroke();
    }

    // Красная точка в начале траектории
    if (trajectoryPoints.length > 0) {
        const startPoint = trajectoryPoints[0];
        const cp = toCanvasCoords(startPoint, cx, cy, scaleX, scaleY);
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'red';
        ctx.fill();
        // Добавляем свечение
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'red';
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

/**
 * Рисуем кадр: траектория + красная точка
 */
function drawFrame(t) {
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    // Масштабируем траекторию по всей ширине и высоте с отступами
    const scaleX = (width - MARGIN * 2) / 2;
    const scaleY = (height - MARGIN * 2) / 2;

    // Траектория
    if (trajectoryPoints.length > 0) {
        ctx.beginPath();
        let p = toCanvasCoords(trajectoryPoints[0], cx, cy, scaleX, scaleY);
        ctx.moveTo(p.x, p.y);
        for (let i = 1; i < trajectoryPoints.length; i++) {
            p = toCanvasCoords(trajectoryPoints[i], cx, cy, scaleX, scaleY);
            ctx.lineTo(p.x, p.y);
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0066cc';
        ctx.stroke();
    }

    // Красная точка
    const redPoint = getPointAt(trajectoryPoints, t);
    if (redPoint) {
        const cp = toCanvasCoords(redPoint, cx, cy, scaleX, scaleY);
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'red';
        ctx.fill();
        // Добавляем свечение
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'red';
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

/**
 * Интерполяция точки по параметру t (0..1)
 */
function getPointAt(points, t) {
    if (!points.length) return null;
    if (points.length === 1) return points[0];

    const total = points.length;
    const idxFloat = t * (total - 1);
    const i0 = Math.floor(idxFloat);
    const i1 = Math.min(i0 + 1, total - 1);
    const localT = idxFloat - i0;

    const p0 = points[i0];
    const p1 = points[i1];

    return {
        x: p0.x * (1 - localT) + p1.x * localT,
        y: p0.y * (1 - localT) + p1.y * localT
    };
}

/**
 * Перевод координат траектории [-1..1] в координаты canvas
 */
function toCanvasCoords(point, cx, cy, scaleX, scaleY) {
    return {
        x: cx + point.x * scaleX,
        y: cy - point.y * scaleY
    };
}

