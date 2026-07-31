"""Verdict, margin, and binding-constraint selection."""

from core import critical_speed, defaults, load, progression, riegel, schedule, week
from core.types import (
    DISCIPLINES,
    DisciplineModel,
    DisciplinePrediction,
    Effort,
    SolveRequest,
)

LABEL = {"swim": "Swim", "bike": "Bike", "run": "Run"}
REDISTRIBUTION_NOTE = "the surrounding 2 weeks"


def _pct_month(ramp_per_week: float, projection) -> float:
    """Express a CTL/week ramp as monthly % growth against the block's mean fitness."""
    mean_ctl = sum(projection.weekly_ctl) / max(1, len(projection.weekly_ctl))
    return 100.0 * ramp_per_week * 4.0 / max(1e-9, mean_ctl)


def fit_models(req: SolveRequest) -> dict[str, DisciplineModel]:
    models: dict[str, DisciplineModel] = {}
    for d in DISCIPLINES:
        efforts = req.efforts[d]
        k, was_fitted, was_clamped = riegel.fit_k(efforts, req.settings.riegel_k_default[d])
        cs_fit = critical_speed.fit(efforts)

        if cs_fit is not None:
            cs, d_prime = cs_fit
            source = "critical_speed"
        else:
            cs = critical_speed.fallback_cs(efforts[0], k)
            d_prime = None
            source = "riegel_fitted" if was_fitted else "riegel_default"

        models[d] = DisciplineModel(
            discipline=d,
            critical_speed_mps=cs,
            d_prime_m=d_prime,
            riegel_k=k,
            fit_source=source,
            k_was_clamped=was_clamped,
            zones_mps=critical_speed.zones(cs),
        )
    return models


def predicted_current(req: SolveRequest, models: dict[str, DisciplineModel]) -> dict[str, float]:
    """Current race split. The run leg carries the run-off-the-bike penalty."""
    race = defaults.race_def(req.race)
    out: dict[str, float] = {}
    for d in DISCIPLINES:
        reference = max(req.efforts[d], key=lambda e: e.distance_m)
        t = riegel.predict_time(reference, race.distance(d), models[d].riegel_k)
        if d == "run":
            t *= 1.0 + req.settings.tri_run_penalty_frac
        out[d] = t
    return out


def evaluate(req: SolveRequest) -> dict:
    """
    Core solve. Returns a plain dict so callers can assemble whichever response they
    need — the relaxation search calls this thousands of times and only reads `margin_s`.
    """
    race = defaults.race_def(req.race)
    settings = req.settings
    models = fit_models(req)
    current = predicted_current(req, models)

    total_hours = max(1e-9, req.weekly_hours_available)
    projected: dict[str, float] = {}
    plausible: dict[str, float] = {}
    required: dict[str, float] = {}

    for d in DISCIPLINES:
        hours = req.allocation.get(d)
        share = hours / total_hours
        load_now = progression.current_load(
            d, req.profile.current_weekly_hours, share, settings
        )
        gain = progression.plausible_speed_gain(
            d, hours, req.weeks_until_race, load_now, req.profile.age_years, settings
        )
        plausible[d] = progression.time_reduction(gain)
        projected[d] = current[d] * (1.0 - plausible[d])
        required[d] = (current[d] - req.goal.get(d)) / current[d] if current[d] > 0 else 0.0

    projected_finish = sum(projected.values()) + race.transition_s
    margin = req.goal.total_s - projected_finish

    if margin >= settings.tight_margin_frac * req.goal.total_s:
        verdict = "feasible"
    elif margin >= 0:
        verdict = "tight"
    else:
        verdict = "infeasible"

    headroom = {d: plausible[d] - required[d] for d in DISCIPLINES}
    binding_d = min(DISCIPLINES, key=lambda d: headroom[d])

    # HARD constraint. A plan requiring a physiologically implausible ramp is infeasible
    # regardless of the fitness maths, and it takes over as the binding constraint.
    #
    # The ceiling is not fixed: a badly-spaced week recovers worse, so it can absorb a
    # shallower ramp. Blackouts shift load between weeks, which shows up in the ramp too.
    recovery = week.score(req.week_template)
    grid = schedule.build(req)
    projection = load.project(req, grid.weekly_stress)
    safe_ramp = settings.max_weekly_ctl_ramp * recovery.ramp_multiplier
    violated = projection.peak_weekly_ctl_ramp > safe_ramp

    def _fail(constraint: str, explanation: str) -> dict:
        return {
            "verdict": "infeasible",
            "binding_constraint": constraint,
            "binding_explanation": explanation,
            "projected_finish_s": projected_finish,
            "goal_finish_s": req.goal.total_s,
            "margin_s": margin,
            "models": [models[d] for d in DISCIPLINES],
            "predictions": _predictions(
                req, current, projected, required, plausible, headroom, binding_d, "infeasible"
            ),
            "load": projection,
            "recovery": recovery,
            "schedule": grid,
            "safe_ramp": safe_ramp,
        }

    if grid.unabsorbed_stress > 0:
        blocked = ", ".join(str(w + 1) for w in grid.blackout_weeks[:3])
        ratio = projection.peak_weekly_ctl_ramp / max(1e-9, safe_ramp)
        return _fail(
            "blackout",
            f"Blackout in week {blocked} cannot be made up within {REDISTRIBUTION_NOTE} — "
            f"it pushes required ramp to {ratio:.1f}x the safe ceiling. Shorten the "
            f"blackout, or move it next to a lighter week.",
        )

    if violated:
        if recovery.ramp_multiplier < 1.0:
            return _fail(
                "week_spacing",
                f"{recovery.reasons[0].capitalize()} reduces safe ramp to "
                f"{_pct_month(safe_ramp, projection):.0f}%/month — plan requires "
                f"{_pct_month(projection.peak_weekly_ctl_ramp, projection):.0f}%. "
                f"Spread the hard days out, or ramp more gently.",
            )
        return _fail(
            "ramp_rate",
            f"This plan ramps at {projection.peak_weekly_ctl_ramp:.1f} CTL/week against "
            f"your ceiling of {safe_ramp:.1f}. Going from "
            f"{req.profile.current_weekly_hours:.1f} to {req.weekly_hours_available:.1f} "
            f"h/week in {req.weeks_until_race} weeks is too steep to absorb.",
        )

    if verdict == "feasible":
        binding = "aggregate_margin"
        explanation = (
            f"Projected {_clock(projected_finish)} against a goal of "
            f"{_clock(req.goal.total_s)} — {_mins(margin)} in hand."
        )
    else:
        binding = f"{binding_d}_headroom"
        explanation = (
            f"{LABEL[binding_d]} requires a {required[binding_d] * 100:.1f}% improvement; "
            f"{plausible[binding_d] * 100:.1f}% is plausible in {req.weeks_until_race} weeks "
            f"at {req.allocation.get(binding_d):.1f} h/week."
        )

    return {
        "verdict": verdict,
        "binding_constraint": binding,
        "binding_explanation": explanation,
        "projected_finish_s": projected_finish,
        "goal_finish_s": req.goal.total_s,
        "margin_s": margin,
        "models": [models[d] for d in DISCIPLINES],
        "predictions": _predictions(
            req, current, projected, required, plausible, headroom, binding_d, verdict
        ),
        "load": projection,
        "recovery": recovery,
        "schedule": grid,
        "safe_ramp": safe_ramp,
    }


def _predictions(req, current, projected, required, plausible, headroom, binding_d, verdict):
    total = max(1e-9, sum(projected.values()))
    return [
        DisciplinePrediction(
            discipline=d,
            predicted_current_s=current[d],
            goal_s=req.goal.get(d),
            projected_s=projected[d],
            required_time_reduction_pct=required[d] * 100.0,
            plausible_time_reduction_pct=plausible[d] * 100.0,
            headroom_pct=headroom[d] * 100.0,
            allocated_hours=req.allocation.get(d),
            share_of_projected_time_pct=100.0 * projected[d] / total,
            is_binding=(verdict != "feasible" and d == binding_d),
        )
        for d in DISCIPLINES
    ]


def _clock(seconds: float) -> str:
    s = int(round(seconds))
    return f"{s // 3600}:{(s % 3600) // 60:02d}:{s % 60:02d}"


def _mins(seconds: float) -> str:
    m = abs(seconds) / 60.0
    return f"{m:.0f} min" if m >= 1 else f"{abs(seconds):.0f} s"
