"""
Injury chance, and the inverse solve that answers "what must change to get it down?".

⚠️ The percentage is a MODELLED figure, not an epidemiological one. It is a logistic
function of peak ACWR, and ACWR-based risk prediction is contested — the acute and
chronic windows share data (mathematical coupling), and published threshold values have
failed to replicate. The number is monotone and directionally sensible: aggressive ramps
read higher, gentle ramps read lower. It should not be read as a calibrated probability
for an individual athlete. Every response carries this caveat inline, and the curve
constants are exposed in SolverSettings.
"""

import math
from dataclasses import replace

from core import load
from core.types import (
    AbsorberOption,
    Allocation,
    InjuryRisk,
    LoadProjection,
    SolveRequest,
    SolverSettings,
)

CAVEAT = (
    "Modelled from your peak acute:chronic load ratio, not from population injury data. "
    "ACWR-based risk is contested in the literature — treat this as a directional "
    "guardrail, not a personal probability."
)

BISECTION_STEPS = 40


def chance_pct(peak_acwr: float, settings: SolverSettings) -> float:
    """Logistic in peak ACWR. Monotone increasing, bounded by base and ceiling."""
    z = settings.injury_steepness * (peak_acwr - settings.injury_midpoint_acwr)
    sigmoid = 1.0 / (1.0 + math.exp(-max(-60.0, min(60.0, z))))
    span = settings.injury_ceiling_pct - settings.injury_base_pct
    return settings.injury_base_pct + span * sigmoid


def assess(projection: LoadProjection, settings: SolverSettings) -> InjuryRisk:
    return InjuryRisk(
        chance_pct=chance_pct(projection.peak_acwr, settings),
        peak_acwr=projection.peak_acwr,
        threshold_acwr=settings.acwr_flag_threshold,
        weeks_above_threshold=projection.weeks_above_threshold,
        caveat=CAVEAT,
    )


def _chance_for(req: SolveRequest) -> float:
    return chance_pct(load.project(req).peak_acwr, req.settings)


def _with_hours(req: SolveRequest, hours: float) -> SolveRequest:
    """Rescale the allocation proportionally so it keeps summing to the new budget."""
    prior = req.allocation.swim_h + req.allocation.bike_h + req.allocation.run_h
    scale = hours / prior if prior > 0 else 0.0
    return replace(
        req,
        weekly_hours_available=hours,
        allocation=Allocation(
            req.allocation.swim_h * scale,
            req.allocation.bike_h * scale,
            req.allocation.run_h * scale,
        ),
    )


def _with_weeks(req: SolveRequest, weeks: int) -> SolveRequest:
    return replace(req, weeks_until_race=weeks)


def _bisect(build, lo: float, hi: float, target: float, integral: bool = False) -> float | None:
    """
    Find the control value closest to `lo` whose chance is <= target.

    `lo` is the athlete's current value; `hi` is the safe extreme of that axis. Note the
    two absorbers run in opposite directions — safety lies at MORE weeks but FEWER hours
    — so callers pass hi accordingly and the ordering of lo/hi is deliberately not
    assumed to be ascending.
    """
    if _chance_for(build(hi)) > target:
        return None  # even the extreme end of this axis cannot get there
    for _ in range(BISECTION_STEPS):
        mid = (lo + hi) / 2
        if integral:
            mid = round(mid)
            if mid in (round(lo), round(hi)):
                break
        if _chance_for(build(mid)) <= target:
            hi = mid
        else:
            lo = mid
    return round(hi) if integral else hi


def absorbers_for(req: SolveRequest, target_pct: float, evaluate) -> list[AbsorberOption]:
    """
    Which single change brings injury chance down to `target_pct`, and what each does to
    the goal. The asymmetry is the point: cutting hours lowers risk but costs you the
    goal; adding weeks lowers risk and helps it.
    """
    baseline = evaluate(req)["margin_s"]
    options: list[AbsorberOption] = []

    fewer_hours = _bisect(
        lambda h: _with_hours(req, h), req.weekly_hours_available, 0.5, target_pct
    )
    if fewer_hours is not None and fewer_hours < req.weekly_hours_available - 0.05:
        candidate = _with_hours(req, fewer_hours)
        result = evaluate(candidate)
        options.append(
            AbsorberOption(
                control="weekly_hours",
                label="Train fewer hours",
                new_value=fewer_hours,
                human=f"{fewer_hours:.1f} h/week (from {req.weekly_hours_available:.1f})",
                resulting_chance_pct=_chance_for(candidate),
                resulting_verdict=result["verdict"],
                resulting_margin_s=result["margin_s"],
                helps_goal=result["margin_s"] > baseline,
            )
        )

    more_weeks = _bisect(
        lambda w: _with_weeks(req, int(w)), req.weeks_until_race, 104, target_pct, integral=True
    )
    if more_weeks is not None and more_weeks > req.weeks_until_race:
        candidate = _with_weeks(req, int(more_weeks))
        result = evaluate(candidate)
        options.append(
            AbsorberOption(
                control="weeks",
                label="Start earlier",
                new_value=float(more_weeks),
                human=f"{int(more_weeks)} weeks (from {req.weeks_until_race})",
                resulting_chance_pct=_chance_for(candidate),
                resulting_verdict=result["verdict"],
                resulting_margin_s=result["margin_s"],
                helps_goal=result["margin_s"] > baseline,
            )
        )

    return options
