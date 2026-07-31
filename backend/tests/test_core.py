import math

import pytest

from core import critical_speed, progression, relax, riegel, solve
from core.types import (
    Allocation,
    AthleteProfile,
    Effort,
    GoalSpec,
    SolveRequest,
    SolverSettings,
)

SWIM = [Effort(400, 420), Effort(1500, 1680)]
BIKE = [Effort(20000, 2160), Effort(40000, 4500)]
RUN = [Effort(5000, 1350), Effort(10000, 2820)]


def make_request(**overrides) -> SolveRequest:
    base = dict(
        profile=AthleteProfile(40, "male", 178, 75, 5.0),
        race="half",
        efforts={"swim": SWIM, "bike": BIKE, "run": RUN},
        weeks_until_race=16,
        weekly_hours_available=8.0,
        allocation=Allocation(1.5, 4.0, 2.5),
        goal=GoalSpec(18000, 1946, 9600, 5974),
        settings=SolverSettings(),
    )
    base.update(overrides)
    return SolveRequest(**base)


# ---------------------------------------------------------------- riegel


def test_fit_k_matches_closed_form():
    k, fitted, clamped = riegel.fit_k(RUN, 1.06)
    assert fitted and not clamped
    assert k == pytest.approx(math.log(2820 / 1350) / math.log(2.0), abs=1e-9)
    assert k == pytest.approx(1.063, abs=0.001)  # textbook running value is 1.06


def test_fit_k_falls_back_with_one_effort():
    k, fitted, _ = riegel.fit_k([Effort(5000, 1350)], 1.06)
    assert k == 1.06 and not fitted


def test_fit_k_clamps_implausible_exponent():
    # Same pace at double the distance implies k = 1.0; a *faster* long effort is absurd.
    k, _, clamped = riegel.fit_k([Effort(5000, 1350), Effort(10000, 2000)], 1.06)
    assert clamped and k == riegel.K_MIN


def test_predict_time_round_trips_with_predict_distance():
    ref = Effort(10000, 2820)
    t = riegel.predict_time(ref, 21100, 1.06)
    assert riegel.predict_distance(ref, t, 1.06) == pytest.approx(21100, rel=1e-9)


# ---------------------------------------------------------------- critical speed


def test_cs_fit_is_closed_form():
    cs, d_prime = critical_speed.fit(RUN)
    assert cs == pytest.approx((10000 - 5000) / (2820 - 1350))
    assert cs == pytest.approx(3.401, abs=0.001)
    assert d_prime == pytest.approx(408.2, abs=0.5)  # normal range for a runner


def test_cs_rejects_degenerate_pair():
    # Longer distance in less time -> negative CS
    assert critical_speed.fit([Effort(5000, 1350), Effort(10000, 1200)]) is None
    assert critical_speed.fit([Effort(5000, 1350)]) is None


def test_zones_are_ordered_and_anchored_on_cs():
    z = critical_speed.zones(3.4)
    assert z["z4"][0] < 3.4 < z["z4"][1]
    assert z["z1"][1] < z["z3"][0] < z["z5"][0]


# ---------------------------------------------------------------- progression


def test_speed_gain_saturates_and_is_monotonic():
    s = SolverSettings()
    gains = [
        progression.plausible_speed_gain("run", 2.5, w, 14.0, 40, s) for w in (4, 16, 52, 520)
    ]
    assert gains == sorted(gains)
    assert gains[-1] < s.g_ceiling["run"]  # never exceeds the ceiling


def test_time_reduction_is_not_speed_gain():
    # 10% faster does not mean 10% less time
    assert progression.time_reduction(0.10) == pytest.approx(0.0909, abs=1e-4)


def test_age_reduces_ceiling_only_above_35():
    assert progression.age_factor(30) == 1.0
    assert progression.age_factor(35) == 1.0
    assert progression.age_factor(55) < progression.age_factor(40) < 1.0


# ---------------------------------------------------------------- feasibility


def test_seeded_default_is_infeasible_and_run_bound():
    r = solve.solve(make_request())
    assert r.verdict == "infeasible"
    assert r.binding_constraint == "run_headroom"
    assert r.margin_s < 0


def test_generous_goal_is_feasible():
    r = solve.solve(make_request(goal=GoalSpec(25200, 2724, 13440, 8556)))
    assert r.verdict == "feasible"
    assert r.relaxations == [] and r.cheapest_fix is None


def test_more_weeks_never_hurts_the_margin():
    a = solve.solve(make_request(weeks_until_race=8)).margin_s
    b = solve.solve(make_request(weeks_until_race=24)).margin_s
    assert b > a


def test_run_penalty_slows_projected_finish():
    fast = solve.solve(make_request(settings=SolverSettings(tri_run_penalty_frac=0.0)))
    slow = solve.solve(make_request(settings=SolverSettings(tri_run_penalty_frac=0.10)))
    assert slow.projected_finish_s > fast.projected_finish_s


def test_single_effort_emits_a_warning():
    r = solve.solve(make_request(efforts={"swim": [SWIM[0]], "bike": BIKE, "run": RUN}))
    assert any("only one effort" in w for w in r.warnings)


# ---------------------------------------------------------------- relaxation


def test_relaxations_actually_reach_feasibility():
    req = make_request()
    for option in solve.solve(req).relaxations:
        after = relax.apply_delta(req, option.control, option.delta)
        assert relax.evaluate(after)["verdict"] in ("feasible", "tight")


def test_cheapest_fix_is_among_the_options():
    r = solve.solve(make_request())
    assert r.cheapest_fix in r.relaxations


def test_weeks_and_hours_are_not_the_same_lever():
    """
    With stimulus = hours * weeks, scaling either by the same factor gives an identical
    result, which makes the relaxation search pick arbitrarily between two equivalent
    fixes. The sub-linear weeks exponent must keep them distinguishable.
    """
    req = make_request()
    more_weeks = solve.solve(relax.apply_delta(req, "weeks", 12)).projected_finish_s
    more_hours = solve.solve(relax.apply_delta(req, "weekly_hours", 6.0)).projected_finish_s
    assert abs(more_weeks - more_hours) > 30, "axes collapsed into one lever"
    assert more_hours < more_weeks, "weekly volume should outweigh block length"


# ---------------------------------------------------------------- load & injury


def _at(req, hours=None, weeks=None):
    out = req
    if hours is not None:
        out = relax.apply_delta(out, "weekly_hours", hours - out.weekly_hours_available)
    if weeks is not None:
        out = relax.apply_delta(out, "weeks", weeks - out.weeks_until_race)
    return out


def test_injury_rises_with_hours_and_falls_with_weeks():
    req = make_request()
    chance = lambda r: solve.solve(r).injury.chance_pct
    assert chance(_at(req, hours=14)) > chance(req) > chance(_at(req, hours=5.5))
    assert chance(_at(req, weeks=26)) < chance(req) < chance(_at(req, weeks=8))


def test_steady_state_training_is_near_baseline_risk():
    """Holding current volume means no ramp, so ACWR ~1 and risk sits near the floor."""
    req = _at(make_request(), hours=5.0)
    r = solve.solve(req)
    assert r.load.peak_weekly_ctl_ramp < 0.1
    assert r.injury.peak_acwr == pytest.approx(1.0, abs=0.02)
    assert r.injury.chance_pct < 10.0


def test_hard_ramp_violation_overrides_the_verdict():
    r = solve.solve(_at(make_request(), hours=20, weeks=8))
    assert r.verdict == "infeasible"
    assert r.binding_constraint == "ramp_rate"
    assert r.load.ramp_hard_violation


def test_injury_response_never_omits_the_caveat():
    r = solve.solve(make_request())
    assert "contested" in r.injury.caveat
    assert "not from population injury data" in r.injury.caveat


def test_absorbers_actually_hit_the_target():
    req = _at(make_request(), hours=14, weeks=8)
    target = 20.0
    absorbers = solve.solve(req, target).injury_absorbers
    assert absorbers, "expected at least one way down"
    for a in absorbers:
        assert a.resulting_chance_pct <= target + 0.5


def test_absorbers_disagree_about_the_goal():
    """
    The whole point of the control: cutting hours lowers risk at the cost of the goal,
    while starting earlier lowers risk and helps it. If both moved the same way the
    absorber prompt would be pointless.
    """
    req = _at(make_request(), hours=14, weeks=8)
    by = {a.control: a for a in solve.solve(req, 20.0).injury_absorbers}
    assert by["weekly_hours"].helps_goal is False
    assert by["weeks"].helps_goal is True


def test_unreachable_injury_target_returns_no_absorbers():
    req = make_request()
    assert solve.solve(req, 0.5).injury_absorbers == []


def test_apply_delta_preserves_allocation_budget():
    after = relax.apply_delta(make_request(), "weekly_hours", 2.0)
    total = after.allocation.swim_h + after.allocation.bike_h + after.allocation.run_h
    assert total == pytest.approx(after.weekly_hours_available)
