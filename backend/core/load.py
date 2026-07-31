"""
Training load projection: CTL / ATL / ACWR over the block.

The athlete ramps linearly from their current weekly load to the planned target across
the whole block, which is why a longer block produces a gentler ramp — that is the
mechanism behind "more weeks lowers injury chance".
"""

from core.progression import weekly_stress
from core.types import DISCIPLINES, LoadProjection, SolveRequest

CTL_TAU_DAYS = 42.0
ATL_TAU_DAYS = 7.0

RAMP_NOTE = (
    "Ramp-rate flag against a threshold of {threshold:g}. Acute:chronic ratio thresholds "
    "are contested in the sports science literature; treat this as a heuristic guardrail, "
    "not a risk estimate."
)


def total_weekly_stress(req: SolveRequest, weekly_hours: float) -> float:
    """Stress for a given weekly volume, split by the planned allocation shares."""
    budget = max(1e-9, req.weekly_hours_available)
    total = 0.0
    for d in DISCIPLINES:
        share = req.allocation.get(d) / budget
        total += weekly_stress(weekly_hours * share, req.settings.mean_intensity_factor[d])
    return total


def project(req: SolveRequest, weekly_stress: list[float] | None = None) -> LoadProjection:
    """
    CTL/ATL/ACWR across the block.

    `weekly_stress` overrides the smooth linear ramp — the schedule builder passes the
    blackout-adjusted series so that redistributed load shows up in the ramp rate.
    """
    settings = req.settings
    weeks = max(1, req.weeks_until_race)

    start_daily = total_weekly_stress(req, req.profile.current_weekly_hours) / 7.0
    target_daily = total_weekly_stress(req, req.weekly_hours_available) / 7.0

    ctl = atl = start_daily
    weekly_ctl: list[float] = []
    weekly_atl: list[float] = []
    weekly_acwr: list[float] = []
    peak_ramp = 0.0
    prev_ctl = ctl

    for w in range(weeks):
        if weekly_stress is not None and w < len(weekly_stress):
            daily = weekly_stress[w] / 7.0
        else:
            # Linear ramp of weekly volume across the block.
            frac = w / (weeks - 1) if weeks > 1 else 1.0
            daily = start_daily + (target_daily - start_daily) * frac
        for _ in range(7):
            ctl += (daily - ctl) / CTL_TAU_DAYS
            atl += (daily - atl) / ATL_TAU_DAYS
        weekly_ctl.append(ctl)
        weekly_atl.append(atl)
        weekly_acwr.append(atl / ctl if ctl > 1e-9 else 1.0)
        peak_ramp = max(peak_ramp, ctl - prev_ctl)
        prev_ctl = ctl

    peak_acwr = max(weekly_acwr)
    above = sum(1 for a in weekly_acwr if a > settings.acwr_flag_threshold)

    return LoadProjection(
        weekly_ctl=weekly_ctl,
        weekly_atl=weekly_atl,
        weekly_acwr=weekly_acwr,
        peak_weekly_ctl_ramp=peak_ramp,
        peak_acwr=peak_acwr,
        weeks_above_threshold=above,
        ramp_flag=peak_acwr > settings.acwr_flag_threshold,
        ramp_hard_violation=peak_ramp > settings.max_weekly_ctl_ramp,
        ramp_note=RAMP_NOTE.format(threshold=settings.acwr_flag_threshold),
    )
