from dataclasses import dataclass
import numpy as np
import cv2
from webeyetrack import WebEyeTrack, WebEyeTrackConfig

@dataclass
class GazeTrajectory:
    x: np.ndarray
    y: np.ndarray
    blink: np.ndarray[bool]


def gaze_from_video(video_path: str) -> GazeTrajectory:
    wet = WebEyeTrack(WebEyeTrackConfig())

    x = []
    y = []
    blink = []

    cap = cv2.VideoCapture(video_path)
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        status, result, detection = wet.process_frame(frame)
        if result:
            x.append(result.norm_pog[0])
            y.append(result.norm_pog[1])
            blink.append(result.gaze_state == 'closed')
        else:
            x.append(0)
            y.append(0)
            blink.append(True)

    cap.release()

    return GazeTrajectory(x=np.array(x), y=np.array(y), blink=np.array(blink))
