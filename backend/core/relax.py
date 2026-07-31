"""
Relaxation search: the cheapest single change that makes an infeasible goal reachable.

Bounded grid scan per axis, deliberately NOT bisection — the hours axis is not
monotonic once the ramp constraint lands (more hours improves fitness but can trip
the physiological ceiling), so a monotonic search would be unsound.
"""

from dataclasses import replace

from core.feasibility import evaluate
from core.types import Allocation, GoalSpec, RelaxationOption, SolveRequest

# (control, natural unit, grid of deltas ascending == cheapest first)
AXES: list[tuple[str, float, list[float]]] = [
    ("weeks", 1.0, [float(w) for w in range(1, 13)]),
    ("weekly_hours", 0.25, [0.25 * i for i in range(1, 25)]),
    ("goal_time", 60.0, [60.0 * i for i in range(1, 61)]),
]

_VERDICT_RANK = {"feasible": 0, "tight": 1, "infeasible": 2}


def apply_delta(req: SolveRequest, control: str, delta: float) -> SolveRequest:
    """Return a new request with one control relaxed by delta."""
    if control == "weeks":
        return replace(req, weeks_until_race=req.weeks_until_race + int(delta))

    if control == "weekly_hours":
        budget = req.weekly_hours_available + delta
        # Extra hours land proportionally so the allocation keeps summing to the budget.
        prior = req.allocation.swim_h + req.allocation.bike_h + req.allocation.run_h
        if prior <= 0:
            share = budget / 3.0
            alloc = Allocation(share, share, share)
        else:
            scale = budget / prior
            alloc = Allocation(
                req.allocation.swim_h * scale,
                req.allocation.bike_h * scale,
                req.allocation.run_h * scale,
            )
        return replace(req, weekly_hours_available=budget, allocation=alloc)

    if control == "goal_time":
        total = req.goal.total_s + delta
        prior = req.goal.swim_s + req.goal.bike_s + req.goal.run_s
        legs = max(1.0, total - (req.goal.total_s - prior))
        scale = legs / prior if prior > 0 else 1.0
        return replace(
            req,
            goal=GoalSpec(
                total_s=total,
                swim_s=req.goal.swim_s * scale,
                bike_s=req.goal.bike_s * scale,
                run_s=req.goal.run_s * scale,
            ),
        )

    raise ValueError(f"unknown control: {control}")


def _human(control: str, delta: float) -> str:
    if control == "weeks":
        return f"+{int(delta)} week" + ("s" if delta != 1 else "")
    if control == "weekly_hours":
        minutes = int(round(delta * 60))
        return f"+{minutes} min/week" if minutes < 60 else f"+{delta:g} h/week"
    return f"goal {int(round(delta / 60))} min slower"


def search(req: SolveRequest) -> list[RelaxationOption]:
    """First success per axis. Axes that cannot reach feasibility at all are omitted."""
    options: list[RelaxationOption] = []
    for control, unit, deltas in AXES:
        for delta in deltas:
            result = evaluate(apply_delta(req, control, delta))
            if result["verdict"] in ("feasible", "tight"):
                options.append(
                    RelaxationOption(
                        control=control,
                        delta=delta,
                        human=_human(control, delta),
                        resulting_verdict=result["verdict"],
                        resulting_margin_s=result["margin_s"],
                        normalized_cost=delta / unit,
                    )
                )
                break
    return options


def cheapest(options: list[RelaxationOption]) -> RelaxationOption | None:
    """
    Fewest steps of the control's natural unit (1 week, 15 min/week, 1 min of goal).
    Ties break toward a full 'feasible' and then toward the larger resulting margin.
    """
    if not options:
        return None
    return min(
        options,
        key=lambda o: (
            o.normalized_cost,
            _VERDICT_RANK[o.resulting_verdict],
            -o.resulting_margin_s,
        ),
    )
