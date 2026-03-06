"""Feature extraction from IMU time series data."""
import numpy as np
from .imu import IMUTimeSeries


def extract_imu_features(imu: IMUTimeSeries) -> dict[str, float]:
    """Extract 90 motion features from 6-axis IMU data.

    Features cover:
    - Statistical (mean, std, min, max, RMS) per axis (42 features)
    - Magnitude features for accel and gyro (10 features)
    - Cross-axis correlations (6 features)
    - Frequency domain (dominant freq, spectral energy per axis) (14 features)
    - Temporal (zero crossings, peak count per axis) (12 features)
    - Derived (jerk magnitude, smoothness) (6 features)
    """
    if imu.n_samples < 10:
        return {"error": "insufficient_samples", "n_samples": imu.n_samples}

    features = {}

    # Per-axis statistical features
    axes = {
        "ax": imu.accel_x_mg, "ay": imu.accel_y_mg, "az": imu.accel_z_mg,
        "gx": imu.gyro_x_mdps, "gy": imu.gyro_y_mdps, "gz": imu.gyro_z_mdps,
    }

    for name, data in axes.items():
        features[f"{name}_mean"] = float(np.mean(data))
        features[f"{name}_std"] = float(np.std(data))
        features[f"{name}_min"] = float(np.min(data))
        features[f"{name}_max"] = float(np.max(data))
        features[f"{name}_rms"] = float(np.sqrt(np.mean(data**2)))
        features[f"{name}_range"] = float(np.max(data) - np.min(data))
        features[f"{name}_skew"] = float(_skewness(data))

    # Magnitude features
    accel_mag = imu.accel_magnitude
    gyro_mag = imu.gyro_magnitude

    features["accel_mag_mean"] = float(np.mean(accel_mag))
    features["accel_mag_max"] = float(np.max(accel_mag))
    features["accel_mag_std"] = float(np.std(accel_mag))
    features["accel_mag_range"] = float(np.max(accel_mag) - np.min(accel_mag))
    features["accel_mag_rms"] = float(np.sqrt(np.mean(accel_mag**2)))

    features["gyro_mag_mean"] = float(np.mean(gyro_mag))
    features["gyro_mag_max"] = float(np.max(gyro_mag))
    features["gyro_mag_std"] = float(np.std(gyro_mag))
    features["gyro_mag_range"] = float(np.max(gyro_mag) - np.min(gyro_mag))
    features["gyro_mag_rms"] = float(np.sqrt(np.mean(gyro_mag**2)))

    # Cross-axis correlations
    features["corr_ax_ay"] = float(_safe_corrcoef(imu.accel_x_mg, imu.accel_y_mg))
    features["corr_ax_az"] = float(_safe_corrcoef(imu.accel_x_mg, imu.accel_z_mg))
    features["corr_ay_az"] = float(_safe_corrcoef(imu.accel_y_mg, imu.accel_z_mg))
    features["corr_gx_gy"] = float(_safe_corrcoef(imu.gyro_x_mdps, imu.gyro_y_mdps))
    features["corr_gx_gz"] = float(_safe_corrcoef(imu.gyro_x_mdps, imu.gyro_z_mdps))
    features["corr_gy_gz"] = float(_safe_corrcoef(imu.gyro_y_mdps, imu.gyro_z_mdps))

    # Frequency domain features
    dt = imu.duration_s / imu.n_samples if imu.n_samples > 0 else 0.002
    for name, data in axes.items():
        fft_vals = np.abs(np.fft.rfft(data - np.mean(data)))
        freqs = np.fft.rfftfreq(len(data), d=dt)
        if len(fft_vals) > 1:
            peak_idx = np.argmax(fft_vals[1:]) + 1  # Skip DC
            features[f"{name}_dom_freq"] = float(freqs[peak_idx])
            features[f"{name}_spectral_energy"] = float(np.sum(fft_vals**2))
        else:
            features[f"{name}_dom_freq"] = 0.0
            features[f"{name}_spectral_energy"] = 0.0

    # Temporal features
    for name, data in axes.items():
        centered = data - np.mean(data)
        zero_crossings = np.sum(np.diff(np.sign(centered)) != 0)
        features[f"{name}_zero_crossings"] = float(zero_crossings)

        # Peak count (local maxima)
        if len(data) > 2:
            peaks = np.sum((data[1:-1] > data[:-2]) & (data[1:-1] > data[2:]))
            features[f"{name}_peaks"] = float(peaks)
        else:
            features[f"{name}_peaks"] = 0.0

    # Jerk (derivative of acceleration)
    if imu.n_samples > 1:
        dt_s = dt
        jerk_x = np.diff(imu.accel_x_mg) / dt_s
        jerk_y = np.diff(imu.accel_y_mg) / dt_s
        jerk_z = np.diff(imu.accel_z_mg) / dt_s
        jerk_mag = np.sqrt(jerk_x**2 + jerk_y**2 + jerk_z**2)

        features["jerk_mag_mean"] = float(np.mean(jerk_mag))
        features["jerk_mag_max"] = float(np.max(jerk_mag))
        features["jerk_mag_std"] = float(np.std(jerk_mag))

        # Smoothness (negative mean squared jerk — higher is smoother)
        features["smoothness"] = float(-np.mean(jerk_mag**2))
        features["jerk_ratio"] = float(np.max(jerk_mag) / (np.mean(jerk_mag) + 1e-9))
        features["accel_entropy"] = float(_signal_entropy(accel_mag))
    else:
        features["jerk_mag_mean"] = 0.0
        features["jerk_mag_max"] = 0.0
        features["jerk_mag_std"] = 0.0
        features["smoothness"] = 0.0
        features["jerk_ratio"] = 0.0
        features["accel_entropy"] = 0.0

    features["n_samples"] = float(imu.n_samples)
    features["duration_s"] = float(imu.duration_s)
    features["sample_rate_hz"] = float(imu.sample_rate_hz)

    return features


def _skewness(x: np.ndarray) -> float:
    m = np.mean(x)
    s = np.std(x)
    if s < 1e-9:
        return 0.0
    return float(np.mean(((x - m) / s) ** 3))


def _safe_corrcoef(a: np.ndarray, b: np.ndarray) -> float:
    if np.std(a) < 1e-9 or np.std(b) < 1e-9:
        return 0.0
    return float(np.corrcoef(a, b)[0, 1])


def _signal_entropy(x: np.ndarray, bins: int = 20) -> float:
    hist, _ = np.histogram(x, bins=bins, density=True)
    hist = hist[hist > 0]
    bin_width = (np.max(x) - np.min(x)) / bins if np.max(x) != np.min(x) else 1.0
    probs = hist * bin_width
    probs = probs[probs > 0]
    return float(-np.sum(probs * np.log2(probs + 1e-12)))
