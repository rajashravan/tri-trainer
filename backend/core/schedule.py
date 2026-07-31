"""
Per-day training grid across the block, and blackout redistribution.

Works in HOURS rather than raw stress, because hours are what the athlete allocated and
what a session is actually prescribed in. Stress is then derived per session from its
intensity, so the aggregate load model and the per-session prescription agree by
construction instead of by coincidence.

Deliberately NOT a constraint solver for session placement. Missed load moves to nearby
weeks by simple proportional spread; whatever will not fit is reported as unabsorbed and
becomes a binding constraint. Failing informatively beats rescheduling cleverly.
"""

from core.progression import weekly_stress
from core.types import DISCIPLINES, DayCell, DisciplineModel, ScheduleGrid, SolveRequest

REDISTRIBUTION_WINDOW = 2  # weeks either side that can absorb a blackout

# Intensity factor by session kind. Long sessions are aerobic; the rest sit nearer
# threshold. Same caveat as every other constant in this codebase — shaped for plausible
# magnitudes, exposed for tuning, not derived from anyone's lab data.
IF_LONG = 0.72
IF_NORMAL = 0.85

LONG_WEIGHT = 2.0
NORMAL_WEIGHT = 1.0


def session_if(is_long: bool) -> float:
    return IF_LONG if is_long else IF_NORMAL


def session_kind(is_long: bool) -> str:
    return "endurance" if is_long else "threshold"


def day_hours(req: SolveRequest, weekly_hours: float) -> list[float]:
    """
    Hours per day of the template, discipline-aware.

    Each discipline's share of the weekly budget is spread only across the days that
    actually carry that discipline. Distributing by session weight alone (ignoring which
    sport a day is) silently contradicts the allocation the athlete set.
    """
    budget = max(1e-9, req.weekly_hours_available)
    out = [0.0] * 7
    for d in DISCIPLINES:
        idx = [i for i, s in enumerate(req.week_template.days) if s.discipline == d]
        if not idx:
            continue
        hours_for_discipline = weekly_hours * (req.allocation.get(d) / budget)
        weights = [
            LONG_WEIGHT if req.week_template.days[i].is_long else NORMAL_WEIGHT
            for i in idx
        ]
        total = sum(weights)
        for i, w in zip(idx, weights):
            out[i] = hours_for_discipline * w / total
    return out


def orphaned_disciplines(req: SolveRequest) -> list[str]:
    """Disciplines given hours but no day to train them on."""
    present = {s.discipline for s in req.week_template.days if s.discipline}
    return [d for d in DISCIPLINES if req.allocation.get(d) > 0.01 and d not in present]


def _stress_for_day(req: SolveRequest, day: int, hours: float) -> float:
    return weekly_stress(hours, session_if(req.week_template.days[day].is_long))


def build(req: SolveRequest, models: dict[str, DisciplineModel]) -> ScheduleGrid:
    weeks = max(1, req.weeks_until_race)
    blackouts = {(int(w), int(d)) for w, d in req.blackout_days}

    start_hours = req.profile.current_weekly_hours
    target_hours = req.weekly_hours_available

    # 1. Baseline hours per day per week, ramping linearly across the block.
    planned: list[list[float]] = []
    for w in range(weeks):
        frac = w / (weeks - 1) if weeks > 1 else 1.0
        planned.append(day_hours(req, start_hours + (target_hours - start_hours) * frac))

    # 2. Blackouts remove hours; what is lost tries to land on nearby weeks.
    missed = [
        sum(planned[w][d] for d in range(7) if (w, d) in blackouts) for w in range(weeks)
    ]
    kept = [
        sum(planned[w][d] for d in range(7) if (w, d) not in blackouts)
        for w in range(weeks)
    ]
    scale = [1.0] * weeks
    unabsorbed_hours = 0.0

    for w in range(weeks):
        if missed[w] <= 0:
            continue
        neighbours = [
            v
            for v in range(max(0, w - REDISTRIBUTION_WINDOW),
                           min(weeks, w + REDISTRIBUTION_WINDOW + 1))
            if v != w and kept[v] > 0
        ]
        if not neighbours:
            unabsorbed_hours += missed[w]
            continue
        share = {v: 1.0 / abs(v - w) for v in neighbours}
        denom = sum(share.values())
        for v, s in share.items():
            scale[v] += (missed[w] * s / denom) / kept[v]

    # 3. Lay it out, deriving each session's prescription from its hours and intensity.
    cells: list[DayCell] = []
    peak = 0.0
    weekly: list[float] = []

    for w in range(weeks):
        week_stress = 0.0
        for d in range(7):
            slot = req.week_template.days[d]
            blacked = (w, d) in blackouts
            hours = 0.0 if blacked else planned[w][d] * scale[w]
            factor = session_if(slot.is_long)
            stress = _stress_for_day(req, d, hours) if hours > 0 else 0.0
            week_stress += stress
            peak = max(peak, stress)

            distance = 0.0
            if hours > 0 and slot.discipline:
                # Invert the stress model: speed = critical speed x intensity.
                distance = models[slot.discipline].critical_speed_mps * factor * hours * 3600.0

            cells.append(
                DayCell(
                    week=w,
                    day=d,
                    discipline=None if blacked else slot.discipline,
                    is_long=slot.is_long,
                    load=stress,
                    duration_s=hours * 3600.0,
                    distance_m=distance,
                    intensity_factor=factor if hours > 0 else 0.0,
                    session_kind=session_kind(slot.is_long) if hours > 0 else "rest",
                    is_blackout=blacked,
                    is_race=(w == weeks - 1 and d == 6),
                )
            )
        weekly.append(week_stress)

    return ScheduleGrid(
        weeks=weeks,
        cells=cells,
        peak_day_load=peak,
        weekly_stress=weekly,
        unabsorbed_hours=unabsorbed_hours,
        unabsorbed_stress=weekly_stress(unabsorbed_hours, IF_NORMAL),
        blackout_weeks=sorted({w for w, _ in blackouts if w < weeks}),
    )
