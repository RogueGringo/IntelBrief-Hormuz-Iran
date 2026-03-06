"""IMU time series data container and preprocessing."""
import numpy as np
from dataclasses import dataclass


@dataclass
class IMUTimeSeries:
    """6-axis IMU data with timestamps."""
    timestamp_us: np.ndarray   # microseconds
    accel_x_mg: np.ndarray
    accel_y_mg: np.ndarray
    accel_z_mg: np.ndarray
    gyro_x_mdps: np.ndarray
    gyro_y_mdps: np.ndarray
    gyro_z_mdps: np.ndarray

    @property
    def n_samples(self) -> int:
        return len(self.timestamp_us)

    @property
    def duration_s(self) -> float:
        if self.n_samples < 2:
            return 0.0
        return (self.timestamp_us[-1] - self.timestamp_us[0]) / 1e6

    @property
    def sample_rate_hz(self) -> float:
        if self.n_samples < 2:
            return 0.0
        return (self.n_samples - 1) / self.duration_s

    @property
    def accel_magnitude(self) -> np.ndarray:
        return np.sqrt(self.accel_x_mg**2 + self.accel_y_mg**2 + self.accel_z_mg**2)

    @property
    def gyro_magnitude(self) -> np.ndarray:
        return np.sqrt(self.gyro_x_mdps**2 + self.gyro_y_mdps**2 + self.gyro_z_mdps**2)

    @classmethod
    def from_csv(cls, path: str) -> "IMUTimeSeries":
        """Load from sovereign-sensor CSV format."""
        import csv
        rows = []
        with open(path, encoding="utf-8-sig") as f:
            header = None
            for line in f:
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    if stripped.startswith("# impact_section"):
                        break  # Stop at impact section
                    continue
                if header is None:
                    header = [c.strip() for c in stripped.split(",")]
                    continue
                cols = stripped.split(",")
                row = {}
                for i, col in enumerate(header):
                    if i < len(cols):
                        try:
                            row[col] = float(cols[i])
                        except ValueError:
                            row[col] = 0.0
                rows.append(row)

        if not rows:
            return cls(*(np.array([]) for _ in range(7)))

        return cls(
            timestamp_us=np.array([r.get("timestamp_us", 0) for r in rows]),
            accel_x_mg=np.array([r.get("accel_x_mg", 0) for r in rows]),
            accel_y_mg=np.array([r.get("accel_y_mg", 0) for r in rows]),
            accel_z_mg=np.array([r.get("accel_z_mg", 0) for r in rows]),
            gyro_x_mdps=np.array([r.get("gyro_x_mdps", 0) for r in rows]),
            gyro_y_mdps=np.array([r.get("gyro_y_mdps", 0) for r in rows]),
            gyro_z_mdps=np.array([r.get("gyro_z_mdps", 0) for r in rows]),
        )

    @classmethod
    def from_dict_list(cls, samples: list[dict]) -> "IMUTimeSeries":
        """Load from list of dicts (API response format)."""
        if not samples:
            return cls(*(np.array([]) for _ in range(7)))
        return cls(
            timestamp_us=np.array([s.get("timestamp_us", 0) for s in samples]),
            accel_x_mg=np.array([s.get("accel_x_mg", 0) for s in samples]),
            accel_y_mg=np.array([s.get("accel_y_mg", 0) for s in samples]),
            accel_z_mg=np.array([s.get("accel_z_mg", 0) for s in samples]),
            gyro_x_mdps=np.array([s.get("gyro_x_mdps", 0) for s in samples]),
            gyro_y_mdps=np.array([s.get("gyro_y_mdps", 0) for s in samples]),
            gyro_z_mdps=np.array([s.get("gyro_z_mdps", 0) for s in samples]),
        )
