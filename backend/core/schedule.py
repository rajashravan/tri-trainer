"""
Per-day training grid across the block, and blackout redistribution.

Deliberately NOT a constraint solver for session placement. Missed load moves to nearby
weeks by simple proportional spread; whatever will not fit is reported as unabsorbed and
becomes a binding constraint. Failing informatively beats rescheduling cleverly.
"""

from core import week
from core.load import total_weekly_stress
from core.types import DayCell, ScheduleGrid, SolveRequest

REDISTRIBUTION_WINDOW = 2  # weeks either side that can absorb a blackout


def baseline_weekly_stress(req: SolveRequest) -> list[float]:
    """Linear ramp of weekly volume from current to target across the block."""
    weeks = max(1, req.weeks_until_race)
    start = total_weekly_stress(req, req.profile.current_weekly_hours)
    target = total_weekly_stress(req, req.weekly_hours_available)
    return [
        start + (target - start) * (w / (weeks - 1) if weeks > 1 else 1.0)
        for w in range(weeks)
    ]


def _blackout_lookup(req: SolveRequest) -> set[tuple[int, int]]:
    return {(int(w), int(d)) for w, d in req.blackout_days}


def build(req: SolveRequest) -> ScheduleGrid:
    weeks = max(1, req.weeks_until_race)
    weights = week.session_weights(req.week_template)
    total_weight = sum(weights)
    blackouts = _blackout_lookup(req)
    baseline = baseline_weekly_stress(req)

    # 1. How much of each week's planned stress is knocked out.
    missed = [0.0] * weeks
    available = [0.0] * weeks
    for w in range(weeks):
        if total_weight <= 0:
            continue
        lost = sum(weights[d] for d in range(7) if (w, d) in blackouts)
        missed[w] = baseline[w] * lost / total_weight
        available[w] = baseline[w] - missed[w]

    # 2. Push what was missed onto nearby weeks that still have training days.
    adjusted = list(available)
    unabsorbed = 0.0
    for w in range(weeks):
        if missed[w] <= 0:
            continue
        neighbours = [
            v
            for v in range(max(0, w - REDISTRIBUTION_WINDOW),
                           min(weeks, w + REDISTRIBUTION_WINDOW + 1))
            if v != w and available[v] > 0
        ]
        if not neighbours:
            unabsorbed += missed[w]
            continue
        # Weight by proximity so the load lands next to where it was lost.
        share = {v: 1.0 / (abs(v - w)) for v in neighbours}
        denom = sum(share.values())
        for v, s in share.items():
            adjusted[v] += missed[w] * s / denom

    # 3. Lay the adjusted weekly stress back out across days.
    cells: list[DayCell] = []
    peak = 0.0
    for w in range(weeks):
        for d in range(7):
            slot = req.week_template.days[d]
            is_blackout = (w, d) in blackouts
            load = 0.0
            if not is_blackout and total_weight > 0:
                load = adjusted[w] * weights[d] / total_weight
            peak = max(peak, load)
            cells.append(
                DayCell(
                    week=w,
                    day=d,
                    discipline=None if is_blackout else slot.discipline,
                    is_long=slot.is_long,
                    load=load,
                    is_blackout=is_blackout,
                    is_race=(w == weeks - 1 and d == 6),
                )
            )

    return ScheduleGrid(
        weeks=weeks,
        cells=cells,
        peak_day_load=peak,
        weekly_stress=adjusted,
        unabsorbed_stress=unabsorbed,
        blackout_weeks=sorted({w for w, _ in blackouts if w < weeks}),
    )
