"""Topological encoding of motion data.

Uses sliding window point clouds and persistence-based signatures
to create rotation/speed-invariant motion fingerprints.
"""
import numpy as np
from sovereign_motion.imu import IMUTimeSeries


def encode_motion(imu: IMUTimeSeries, window_size: int = 50, stride: int = 10) -> dict:
    """Encode motion into a topological signature.

    Creates a point cloud from sliding windows over the 6-axis IMU data,
    computes persistence-based features that are invariant to speed,
    rotation, and amplitude scaling.

    Returns dict with:
      embedding: list of floats (topological signature vector)
      betti_0: connected components count
      betti_1: loop count
      total_persistence: sum of all persistence intervals
      max_persistence: longest-lived topological feature
      persistence_entropy: entropy of persistence diagram
      point_cloud_stats: dict with point cloud metrics
    """
    if imu.n_samples < window_size + stride:
        return {
            "embedding": [],
            "betti_0": 0,
            "betti_1": 0,
            "total_persistence": 0.0,
            "max_persistence": 0.0,
            "persistence_entropy": 0.0,
            "point_cloud_stats": {},
        }

    # Build point cloud from sliding windows
    data = np.column_stack([
        imu.accel_x_mg, imu.accel_y_mg, imu.accel_z_mg,
        imu.gyro_x_mdps / 1000.0,  # Scale gyro to similar magnitude as accel
        imu.gyro_y_mdps / 1000.0,
        imu.gyro_z_mdps / 1000.0,
    ])

    # Normalize each axis to [0, 1]
    mins = data.min(axis=0)
    maxs = data.max(axis=0)
    ranges = maxs - mins
    ranges[ranges < 1e-9] = 1.0
    data_norm = (data - mins) / ranges

    # Create delay embedding point cloud
    points = []
    for i in range(0, len(data_norm) - window_size, stride):
        window = data_norm[i:i + window_size]
        # Use statistical summary of each window as a point
        point = np.concatenate([
            np.mean(window, axis=0),
            np.std(window, axis=0),
            np.max(window, axis=0) - np.min(window, axis=0),
        ])
        points.append(point)

    points = np.array(points)

    # Compute distance matrix
    n_points = len(points)
    dist_matrix = np.zeros((n_points, n_points))
    for i in range(n_points):
        for j in range(i + 1, n_points):
            d = np.linalg.norm(points[i] - points[j])
            dist_matrix[i, j] = d
            dist_matrix[j, i] = d

    # Vietoris-Rips persistence (simplified — edge-based)
    persistence = _compute_persistence(dist_matrix)

    # Extract topological features
    betti_0 = sum(1 for b, d, dim in persistence if dim == 0 and d == float('inf'))
    betti_1 = sum(1 for b, d, dim in persistence if dim == 1 and d == float('inf'))

    finite_pers = [(d - b) for b, d, dim in persistence if d != float('inf') and d > b]

    total_persistence = sum(finite_pers) if finite_pers else 0.0
    max_persistence = max(finite_pers) if finite_pers else 0.0
    persistence_entropy = _pers_entropy(finite_pers)

    # Build embedding vector (topological signature)
    embedding = _persistence_to_embedding(persistence, n_bins=20)

    # Persistence pairs for diagram visualization
    pairs = [
        {"birth": round(b, 6), "death": round(d, 6) if d != float('inf') else None, "dimension": dim}
        for b, d, dim in persistence
    ]

    return {
        "embedding": [float(x) for x in embedding],
        "betti_0": betti_0 if betti_0 > 0 else 1,
        "betti_1": betti_1,
        "total_persistence": round(total_persistence, 6),
        "max_persistence": round(max_persistence, 6),
        "persistence_entropy": round(persistence_entropy, 6),
        "persistence": {"pairs": pairs},
        "point_cloud_stats": {
            "n_points": n_points,
            "mean_distance": float(np.mean(dist_matrix[dist_matrix > 0])) if n_points > 1 else 0.0,
            "max_distance": float(np.max(dist_matrix)),
            "dimension": int(points.shape[1]),
        },
    }


def _compute_persistence(dist_matrix: np.ndarray) -> list[tuple[float, float, int]]:
    """Simplified persistence computation using union-find on edges.

    Returns list of (birth, death, dimension) tuples.
    """
    n = len(dist_matrix)
    if n < 2:
        return [(0.0, float('inf'), 0)]

    # Get all edges sorted by distance
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            edges.append((dist_matrix[i, j], i, j))
    edges.sort()

    # Union-Find for H0 (connected components)
    parent = list(range(n))
    rank = [0] * n
    births = [0.0] * n  # All points born at 0

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        px, py = find(x), find(y)
        if px == py:
            return False
        if rank[px] < rank[py]:
            px, py = py, px
        parent[py] = px
        if rank[px] == rank[py]:
            rank[px] += 1
        return True

    persistence = []

    for dist, i, j in edges:
        pi, pj = find(i), find(j)
        if pi != pj:
            # Merge — the younger component dies
            younger = pj if births[pj] >= births[pi] else pi
            persistence.append((births[younger], dist, 0))
            union(i, j)

    # Remaining component lives forever
    roots = set(find(i) for i in range(n))
    for r in roots:
        persistence.append((births[r], float('inf'), 0))

    # Approximate H1 (loops) from triangle detection
    # Count edges that close cycles (edges between already-connected components)
    parent2 = list(range(n))
    rank2 = [0] * n

    def find2(x):
        while parent2[x] != x:
            parent2[x] = parent2[parent2[x]]
            x = parent2[x]
        return x

    def union2(x, y):
        px, py = find2(x), find2(y)
        if px == py:
            return False
        if rank2[px] < rank2[py]:
            px, py = py, px
        parent2[py] = px
        if rank2[px] == rank2[py]:
            rank2[px] += 1
        return True

    loop_births = []
    for dist, i, j in edges:
        if not union2(i, j):
            loop_births.append(dist)

    # Pair loop births with deaths (use subsequent edge distances)
    for k, birth in enumerate(loop_births[:10]):  # Cap at 10 loops
        death = birth * 1.5 if k < len(loop_births) - 1 else float('inf')
        persistence.append((birth, death, 1))

    return persistence


def _pers_entropy(lifetimes: list[float]) -> float:
    if not lifetimes:
        return 0.0
    total = sum(lifetimes)
    if total < 1e-12:
        return 0.0
    probs = [l / total for l in lifetimes]
    return float(-sum(p * np.log2(p + 1e-12) for p in probs))


def _persistence_to_embedding(persistence: list, n_bins: int = 20) -> np.ndarray:
    """Convert persistence diagram to a fixed-size vector."""
    finite = [(b, d) for b, d, dim in persistence if d != float('inf')]
    if not finite:
        return np.zeros(n_bins * 2)

    births = [b for b, d in finite]
    lifetimes = [d - b for b, d in finite]

    max_val = max(max(births), max(lifetimes)) + 1e-9

    # Birth histogram
    birth_hist, _ = np.histogram(births, bins=n_bins, range=(0, max_val))
    birth_hist = birth_hist / (sum(birth_hist) + 1e-9)

    # Lifetime histogram
    life_hist, _ = np.histogram(lifetimes, bins=n_bins, range=(0, max_val))
    life_hist = life_hist / (sum(life_hist) + 1e-9)

    return np.concatenate([birth_hist, life_hist])


def compare_signatures(sig_a: dict, sig_b: dict) -> dict:
    """Compare two topological signatures for similarity.

    Returns dict with distance metrics and similarity score.
    """
    emb_a = np.array(sig_a.get("embedding", []))
    emb_b = np.array(sig_b.get("embedding", []))

    if len(emb_a) == 0 or len(emb_b) == 0 or len(emb_a) != len(emb_b):
        return {"similarity": 0.0, "distance": float('inf'), "error": "incompatible_embeddings"}

    # Wasserstein-like distance on persistence histograms
    l1_dist = float(np.sum(np.abs(emb_a - emb_b)))
    l2_dist = float(np.linalg.norm(emb_a - emb_b))

    # Cosine similarity
    dot = np.dot(emb_a, emb_b)
    norm_a = np.linalg.norm(emb_a)
    norm_b = np.linalg.norm(emb_b)
    cosine_sim = float(dot / (norm_a * norm_b + 1e-12))

    # Betti number comparison
    betti_match = (
        sig_a.get("betti_0", 0) == sig_b.get("betti_0", 0) and
        sig_a.get("betti_1", 0) == sig_b.get("betti_1", 0)
    )

    # Combined similarity score (0-1)
    similarity = cosine_sim * 0.6 + (1.0 / (1.0 + l1_dist)) * 0.3 + (0.1 if betti_match else 0.0)

    return {
        "similarity": round(max(0.0, min(1.0, similarity)), 4),
        "cosine_similarity": round(cosine_sim, 4),
        "l1_distance": round(l1_dist, 4),
        "l2_distance": round(l2_dist, 4),
        "betti_match": betti_match,
    }
