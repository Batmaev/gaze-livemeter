import numpy as np
import scipy.interpolate as si


def fourier_ios_like(steps=600, harmonics_count=4) -> tuple[np.ndarray, np.ndarray]:
    """
    Воспроизводит логику старых iOS стимулов.
    Пригодится для сопоставления с новыми устройствами.
    """
    first_amplitude = np.random.uniform(0.3, 0.8)
    first_phase = np.random.uniform(0.0, 2 * np.pi)
    coefficients = [(float(first_amplitude), 1.0, float(first_phase))]

    for i in range(2, harmonics_count + 1):
        amplitude_decay = np.random.uniform(4.0, 7.0)
        base_amplitude = first_amplitude * amplitude_decay
        amplitude = base_amplitude / (i * i)
        phase = np.random.uniform(0.0, 2 * np.pi)
        coefficients.append((float(amplitude), float(i), float(phase)))

    t = np.linspace(0.0, 2.0 * np.pi, steps)
    x = np.zeros_like(t)
    y = np.zeros_like(t)
    for amplitude, frequency, phase in coefficients:
        # амплитуды и фазы по X и Y — одинаковые
        x += amplitude * np.cos(frequency * t + phase)
        y += amplitude * np.sin(frequency * t + phase)

    return x, y


def random_spline(steps=600, n_ctrl=8) -> tuple[np.ndarray, np.ndarray]:
    """
    Случайные сплайны, в предварительных экспериментах — самый разнообразный тип траекторий.
    """
    ctrl = np.random.uniform(-5, 5, (n_ctrl, 2))
    tck, u = si.splprep(ctrl.T, s=0)
    u_fine = np.linspace(0, 1, steps)
    x, y = si.splev(u_fine, tck)
    return x, y
