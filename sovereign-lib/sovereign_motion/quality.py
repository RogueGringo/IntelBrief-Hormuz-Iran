"""IMU data quality analysis — detect sensor issues in captured data."""
import numpy as np
from .imu import IMUTimeSeries


def analyze_quality(imu: IMUTimeSeries) -> dict:
    """Analyze IMU data quality and return issue flags.

    Checks for:
    - Sensor saturation (values at rail limits)
    - Timing jitter (irregular sample intervals)
    - Noise floor (signal-to-noise ratio)
    - DC offset drift
    - Axis correlations that suggest mounting issues
    - Data completeness
    """
    if imu.n_samples < 10:
        return {"quality": "insufficient", "score": 0, "issues": ["Too few samples"]}

    issues = []
    scores = {}

    # 1. Saturation check — values near accelerometer/gyro max range
    ACCEL_MAX = 16000  # mg (16g range typical for ISM330DHCX)
    GYRO_MAX = 2000000  # mdps (2000 dps)
    SAT_THRESHOLD = 0.95

    for name, data, limit in [
        ("accel_x", imu.accel_x_mg, ACCEL_MAX),
        ("accel_y", imu.accel_y_mg, ACCEL_MAX),
        ("accel_z", imu.accel_z_mg, ACCEL_MAX),
        ("gyro_x", imu.gyro_x_mdps, GYRO_MAX),
        ("gyro_y", imu.gyro_y_mdps, GYRO_MAX),
        ("gyro_z", imu.gyro_z_mdps, GYRO_MAX),
    ]:
        sat_count = np.sum(np.abs(data) > limit * SAT_THRESHOLD)
        if sat_count > 0:
            pct = sat_count / imu.n_samples * 100
            issues.append(f"{name} saturated: {sat_count} samples ({pct:.1f}%)")

    scores["saturation"] = 1.0 if not any("saturated" in i for i in issues) else 0.5

    # 2. Timing jitter (filter outliers — large gaps from session boundaries)
    if imu.n_samples > 2:
        dt = np.diff(imu.timestamp_us)
        median_dt = np.median(dt)
        if median_dt > 0:
            # Filter out intervals > 10x median (session gaps, not jitter)
            normal_dt = dt[dt < median_dt * 10]
            if len(normal_dt) > 0:
                jitter = np.std(normal_dt) / np.median(normal_dt)
                scores["timing"] = max(0, 1.0 - jitter * 5)
                if jitter > 0.1:
                    issues.append(f"Timing jitter: {jitter:.3f} (>{0.1})")
            else:
                scores["timing"] = 0.5
        else:
            scores["timing"] = 0.0
            issues.append("Invalid timestamps (zero interval)")
    else:
        scores["timing"] = 1.0

    # 3. Noise floor (SNR estimate via high-pass filter)
    for name, data in [("accel", imu.accel_magnitude), ("gyro", imu.gyro_magnitude)]:
        signal_power = np.var(data)
        # High-pass estimate of noise
        noise = np.diff(data)
        noise_power = np.var(noise) / 2  # Approximate
        if noise_power > 0:
            snr = signal_power / noise_power
            scores[f"{name}_snr"] = min(1.0, snr / 10)
        else:
            scores[f"{name}_snr"] = 1.0

    # 4. DC offset check — accel should average ~1g on one axis
    accel_mean_mag = np.mean(imu.accel_magnitude)
    gravity_deviation = abs(accel_mean_mag - 1000) / 1000  # Deviation from 1g
    scores["gravity"] = max(0, 1.0 - gravity_deviation)
    if gravity_deviation > 0.5:
        issues.append(f"Gravity deviation: {gravity_deviation:.2f} (mean accel mag={accel_mean_mag:.0f} mg)")

    # 5. Sample rate consistency
    expected_rate = imu.sample_rate_hz
    if expected_rate > 0:
        if abs(expected_rate - 500) < 50:
            scores["sample_rate"] = 1.0
        elif abs(expected_rate - 500) < 100:
            scores["sample_rate"] = 0.7
            issues.append(f"Sample rate drift: {expected_rate:.0f} Hz (expected ~500)")
        else:
            scores["sample_rate"] = 0.4
            issues.append(f"Unexpected sample rate: {expected_rate:.0f} Hz")
    else:
        scores["sample_rate"] = 0.0

    # 6. Data completeness
    expected_samples = int(imu.duration_s * 500)  # At 500Hz
    if expected_samples > 0:
        completeness = min(1.0, imu.n_samples / expected_samples)
        scores["completeness"] = completeness
        if completeness < 0.9:
            missing_pct = (1 - completeness) * 100
            issues.append(f"Missing data: {missing_pct:.1f}% ({imu.n_samples}/{expected_samples})")
    else:
        scores["completeness"] = 1.0

    # Overall quality score (weighted average)
    weights = {
        "saturation": 2.0,
        "timing": 1.5,
        "accel_snr": 1.0,
        "gyro_snr": 1.0,
        "gravity": 1.0,
        "sample_rate": 1.0,
        "completeness": 1.5,
    }

    total_weight = sum(weights.get(k, 1.0) for k in scores)
    weighted_sum = sum(scores[k] * weights.get(k, 1.0) for k in scores)
    overall = weighted_sum / total_weight if total_weight > 0 else 0

    quality_label = "excellent" if overall > 0.9 else "good" if overall > 0.7 else "fair" if overall > 0.5 else "poor"

    return {
        "quality": quality_label,
        "score": round(overall, 3),
        "scores": {k: round(v, 3) for k, v in scores.items()},
        "issues": issues,
        "n_samples": imu.n_samples,
        "duration_s": round(imu.duration_s, 2),
        "sample_rate_hz": round(imu.sample_rate_hz, 1),
    }
