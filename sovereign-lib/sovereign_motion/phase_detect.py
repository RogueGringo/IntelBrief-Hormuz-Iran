"""Motion phase detection from IMU data.

Detects phases in motion sequences using gyroscope angular velocity
and accelerometer magnitude patterns. Designed for repetitive motion
analysis (sports, industrial, rehabilitation).
"""
import numpy as np
from .imu import IMUTimeSeries


# Phase definitions for general motion analysis
PHASES = [
    "idle",        # Low activity baseline
    "onset",       # Motion initiation (increasing angular velocity)
    "load",        # Loading/preparation phase (backswing-like)
    "peak_load",   # Maximum load position (top of backswing)
    "drive",       # Power generation (downswing-like)
    "impact",      # Peak acceleration event
    "follow",      # Follow-through/deceleration
    "recovery",    # Return to baseline
]


class PhaseDetector:
    """Detect motion phases from 6-axis IMU data."""

    def __init__(
        self,
        idle_gyro_threshold: float = 5000.0,     # mdps — below this is idle
        onset_gyro_threshold: float = 15000.0,    # mdps — motion onset
        impact_accel_threshold: float = 2000.0,   # mg — impact event
        window_ms: float = 50.0,                  # smoothing window
    ):
        self.idle_gyro_threshold = idle_gyro_threshold
        self.onset_gyro_threshold = onset_gyro_threshold
        self.impact_accel_threshold = impact_accel_threshold
        self.window_ms = window_ms

    def detect(self, imu: IMUTimeSeries) -> dict:
        """Detect phases and return phase annotations.

        Returns dict with:
          phases: list of (start_idx, end_idx, phase_name)
          events: list of (idx, event_type)
          summary: dict of phase durations and metrics
        """
        if imu.n_samples < 20:
            return {"phases": [], "events": [], "summary": {}}

        gyro_mag = imu.gyro_magnitude
        accel_mag = imu.accel_magnitude

        # Smooth signals
        win = max(1, int(self.window_ms * imu.sample_rate_hz / 1000))
        gyro_smooth = _moving_avg(gyro_mag, win)
        accel_smooth = _moving_avg(accel_mag, win)

        # Find key events
        events = []

        # Impact: peak acceleration above threshold
        impact_mask = accel_smooth > self.impact_accel_threshold
        if np.any(impact_mask):
            impact_idx = int(np.argmax(accel_smooth))
            events.append((impact_idx, "impact"))

        # Peak gyro (max angular velocity)
        peak_gyro_idx = int(np.argmax(gyro_smooth))
        events.append((peak_gyro_idx, "peak_gyro"))

        # Motion onset: first crossing of onset threshold
        onset_crossings = np.where(
            (gyro_smooth[:-1] < self.onset_gyro_threshold) &
            (gyro_smooth[1:] >= self.onset_gyro_threshold)
        )[0]
        if len(onset_crossings) > 0:
            events.append((int(onset_crossings[0]), "onset"))

        # Motion end: last crossing below onset threshold
        end_crossings = np.where(
            (gyro_smooth[:-1] >= self.onset_gyro_threshold) &
            (gyro_smooth[1:] < self.onset_gyro_threshold)
        )[0]
        if len(end_crossings) > 0:
            events.append((int(end_crossings[-1]), "motion_end"))

        events.sort(key=lambda x: x[0])

        # Build phase segments
        phases = self._segment_phases(imu, gyro_smooth, accel_smooth, events)

        # Summary statistics
        summary = {
            "n_phases": len(phases),
            "peak_gyro_mdps": float(np.max(gyro_mag)),
            "peak_accel_mg": float(np.max(accel_mag)),
            "active_duration_s": self._active_duration(imu, gyro_smooth),
            "phase_durations": {},
        }
        for start, end, name in phases:
            dt = (imu.timestamp_us[min(end, imu.n_samples - 1)] -
                  imu.timestamp_us[start]) / 1e6
            summary["phase_durations"][name] = round(dt, 4)

        return {"phases": phases, "events": events, "summary": summary}

    def _segment_phases(self, imu, gyro_smooth, accel_smooth, events):
        """Segment the motion into phases based on events and thresholds."""
        n = imu.n_samples
        phases = []
        event_dict = {e[1]: e[0] for e in events}

        onset_idx = event_dict.get("onset", 0)
        end_idx = event_dict.get("motion_end", n - 1)
        impact_idx = event_dict.get("impact")
        peak_gyro_idx = event_dict.get("peak_gyro", n // 2)

        # Idle before onset
        if onset_idx > 5:
            phases.append((0, onset_idx, "idle"))

        # Onset
        phases.append((onset_idx, min(onset_idx + 5, n - 1), "onset"))

        # Load phase: onset to peak gyro (if before impact)
        if impact_idx and peak_gyro_idx < impact_idx:
            load_end = peak_gyro_idx
        else:
            load_end = min(onset_idx + (end_idx - onset_idx) // 3, n - 1)

        if load_end > onset_idx + 5:
            phases.append((onset_idx + 5, load_end, "load"))

        # Peak load
        phases.append((load_end, min(load_end + 3, n - 1), "peak_load"))

        # Drive phase: peak load to impact (or 2/3 of motion)
        if impact_idx:
            drive_end = impact_idx
        else:
            drive_end = min(load_end + (end_idx - load_end) * 2 // 3, n - 1)

        if drive_end > load_end + 3:
            phases.append((load_end + 3, drive_end, "drive"))

        # Impact
        if impact_idx:
            phases.append((impact_idx, min(impact_idx + 5, n - 1), "impact"))
            follow_start = impact_idx + 5
        else:
            follow_start = drive_end

        # Follow-through
        if follow_start < end_idx:
            phases.append((follow_start, end_idx, "follow"))

        # Recovery
        if end_idx < n - 5:
            phases.append((end_idx, n - 1, "recovery"))

        return phases

    def _active_duration(self, imu, gyro_smooth):
        active = gyro_smooth > self.idle_gyro_threshold
        if not np.any(active):
            return 0.0
        first = np.argmax(active)
        last = len(active) - 1 - np.argmax(active[::-1])
        return float((imu.timestamp_us[last] - imu.timestamp_us[first]) / 1e6)


def _moving_avg(x: np.ndarray, window: int) -> np.ndarray:
    if window <= 1:
        return x.copy()
    kernel = np.ones(window) / window
    return np.convolve(x, kernel, mode="same")
