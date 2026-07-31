"""Riegel endurance scaling: T2 = T1 * (D2/D1)^k."""

import math

from core.types import Effort

K_MIN = 1.00
K_MAX = 1.15


def fit_k(efforts: list[Effort], default_k: float) -> tuple[float, bool, bool]:
    """
    Fit the personal fatigue exponent.

    Returns (k, was_fitted, was_clamped). With exactly two efforts the log-log
    regression degenerates to a closed-form solve, so no regression is needed.
    k is clamped because two noisy efforts routinely produce absurd exponents —
    k < 1 would imply getting faster per unit distance as distance grows.
    """
    usable = [e for e in efforts if e.distance_m > 0 and e.duration_s > 0]
    if len(usable) < 2:
        return default_k, False, False

    e1, e2 = sorted(usable, key=lambda e: e.distance_m)[:2]
    if e2.distance_m <= e1.distance_m:
        return default_k, False, False

    k = math.log(e2.duration_s / e1.duration_s) / math.log(e2.distance_m / e1.distance_m)
    clamped = not (K_MIN <= k <= K_MAX)
    return min(max(k, K_MIN), K_MAX), True, clamped


def predict_time(reference: Effort, target_distance_m: float, k: float) -> float:
    """Scale a known effort to another distance."""
    return reference.duration_s * (target_distance_m / reference.distance_m) ** k


def predict_distance(reference: Effort, target_duration_s: float, k: float) -> float:
    """Inverse of predict_time: how far in a given time. Used for the 1-effort CS fallback."""
    return reference.distance_m * (target_duration_s / reference.duration_s) ** (1.0 / k)
