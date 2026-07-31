"""Two-parameter critical speed model: d = CS * t + D'."""

from core import riegel
from core.types import Effort

ZONE_BOUNDS = [("z1", 0.0, 0.80), ("z2", 0.80, 0.88), ("z3", 0.88, 0.95),
               ("z4", 0.95, 1.02), ("z5", 1.02, 1.40)]


def fit(efforts: list[Effort]) -> tuple[float, float] | None:
    """
    Closed-form CS/D' from two efforts. Returns (cs_mps, d_prime_m), or None when
    the pair is degenerate (non-positive CS or D', equal durations).
    """
    usable = [e for e in efforts if e.distance_m > 0 and e.duration_s > 0]
    if len(usable) < 2:
        return None

    e1, e2 = sorted(usable, key=lambda e: e.duration_s)[:2]
    dt = e2.duration_s - e1.duration_s
    if dt <= 0:
        return None

    cs = (e2.distance_m - e1.distance_m) / dt
    d_prime = e1.distance_m - cs * e1.duration_s
    if cs <= 0 or d_prime <= 0:
        return None
    return cs, d_prime


def fallback_cs(effort: Effort, k: float) -> float:
    """
    With a single effort there is no CS fit. Approximate threshold as the speed the
    athlete could hold for one hour, via Riegel scaling.
    """
    return riegel.predict_distance(effort, 3600.0, k) / 3600.0


def zones(cs_mps: float) -> dict[str, tuple[float, float]]:
    return {name: (lo * cs_mps, hi * cs_mps) for name, lo, hi in ZONE_BOUNDS}
