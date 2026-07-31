"""Orchestrator. The only core module main.py imports."""

from core import relax
from core.feasibility import evaluate
from core.types import SolveRequest, SolveResponse

CS_VALID_MIN_S = 120.0
CS_VALID_MAX_S = 900.0


def _warnings(req: SolveRequest, result: dict) -> list[str]:
    out: list[str] = []
    for model in result["models"]:
        d = model.discipline
        if model.fit_source == "riegel_default":
            out.append(f"{d.capitalize()}: only one effort given, so pace scaling uses a "
                       f"standard exponent rather than your own.")
        if model.k_was_clamped:
            out.append(f"{d.capitalize()}: the two efforts imply an implausible fatigue "
                       f"curve, so it was clamped to the nearest realistic value.")
        if model.fit_source == "critical_speed":
            durations = [e.duration_s for e in req.efforts[d]]
            if any(t > CS_VALID_MAX_S for t in durations):
                out.append(
                    f"{d.capitalize()}: efforts longer than 15 min sit outside the window "
                    f"where the critical-speed model is valid; threshold may read low."
                )
    return out


def solve(req: SolveRequest) -> SolveResponse:
    result = evaluate(req)

    if result["verdict"] == "feasible":
        options, fix = [], None
    else:
        options = relax.search(req)
        fix = relax.cheapest(options)

    return SolveResponse(
        verdict=result["verdict"],
        binding_constraint=result["binding_constraint"],
        binding_explanation=result["binding_explanation"],
        projected_finish_s=result["projected_finish_s"],
        goal_finish_s=result["goal_finish_s"],
        margin_s=result["margin_s"],
        models=result["models"],
        predictions=result["predictions"],
        relaxations=options,
        cheapest_fix=fix,
        warnings=_warnings(req, result),
    )
