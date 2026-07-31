"""Domain types. Pure dataclasses, no logic, no framework imports."""

from dataclasses import dataclass, field
from typing import Literal

Discipline = Literal["swim", "bike", "run"]
RaceKey = Literal["sprint", "olympic", "half", "full"]
Verdict = Literal["feasible", "tight", "infeasible"]
FitSource = Literal["critical_speed", "riegel_fitted", "riegel_default"]
ControlKey = Literal["weeks", "weekly_hours", "goal_time"]

DISCIPLINES: tuple[str, ...] = ("swim", "bike", "run")


# ---------------------------------------------------------------- input


@dataclass(frozen=True)
class Effort:
    distance_m: float
    duration_s: float


@dataclass(frozen=True)
class AthleteProfile:
    age_years: int
    sex: str
    height_cm: float
    mass_kg: float
    current_weekly_hours: float


@dataclass(frozen=True)
class Allocation:
    swim_h: float
    bike_h: float
    run_h: float

    def get(self, discipline: str) -> float:
        return getattr(self, f"{discipline}_h")


@dataclass(frozen=True)
class GoalSpec:
    total_s: float
    swim_s: float
    bike_s: float
    run_s: float

    def get(self, discipline: str) -> float:
        return getattr(self, f"{discipline}_s")


@dataclass(frozen=True)
class SolverSettings:
    acwr_flag_threshold: float = 1.5
    max_weekly_ctl_ramp: float = 8.0
    tight_margin_frac: float = 0.02
    tri_run_penalty_frac: float = 0.06
    riegel_k_default: dict[str, float] = field(
        default_factory=lambda: {"swim": 1.03, "bike": 1.05, "run": 1.06}
    )
    mean_intensity_factor: dict[str, float] = field(
        default_factory=lambda: {"swim": 0.78, "bike": 0.75, "run": 0.80}
    )
    weeks_exponent: float = 0.85
    tau: dict[str, float] = field(
        default_factory=lambda: {"swim": 26.0, "bike": 73.0, "run": 46.0}
    )
    g_ceiling: dict[str, float] = field(
        default_factory=lambda: {"swim": 0.20, "bike": 0.15, "run": 0.13}
    )
    ctl_reference: dict[str, float] = field(
        default_factory=lambda: {"swim": 45.0, "bike": 75.0, "run": 60.0}
    )
    # Injury-chance curve. Logistic in peak ACWR. See core/injury.py for the caveat.
    injury_base_pct: float = 3.0
    injury_ceiling_pct: float = 65.0
    injury_midpoint_acwr: float = 1.45
    injury_steepness: float = 5.5


@dataclass(frozen=True)
class SolveRequest:
    profile: AthleteProfile
    race: str
    efforts: dict[str, list[Effort]]
    weeks_until_race: int
    weekly_hours_available: float
    allocation: Allocation
    goal: GoalSpec
    settings: SolverSettings


# ---------------------------------------------------------------- derived


@dataclass(frozen=True)
class DisciplineModel:
    discipline: str
    critical_speed_mps: float
    d_prime_m: float | None
    riegel_k: float
    fit_source: str
    k_was_clamped: bool
    zones_mps: dict[str, tuple[float, float]]


@dataclass(frozen=True)
class DisciplinePrediction:
    discipline: str
    predicted_current_s: float
    goal_s: float
    projected_s: float
    required_time_reduction_pct: float
    plausible_time_reduction_pct: float
    headroom_pct: float
    allocated_hours: float
    share_of_projected_time_pct: float
    is_binding: bool


@dataclass(frozen=True)
class LoadProjection:
    weekly_ctl: list[float]
    weekly_atl: list[float]
    weekly_acwr: list[float]
    peak_weekly_ctl_ramp: float
    peak_acwr: float
    weeks_above_threshold: int
    ramp_flag: bool
    ramp_hard_violation: bool
    ramp_note: str


@dataclass(frozen=True)
class InjuryRisk:
    chance_pct: float
    peak_acwr: float
    threshold_acwr: float
    weeks_above_threshold: int
    caveat: str


@dataclass(frozen=True)
class AbsorberOption:
    control: str
    label: str
    new_value: float
    human: str
    resulting_chance_pct: float
    resulting_verdict: str
    resulting_margin_s: float
    helps_goal: bool


@dataclass(frozen=True)
class RelaxationOption:
    control: str
    delta: float
    human: str
    resulting_verdict: str
    resulting_margin_s: float
    normalized_cost: float


@dataclass(frozen=True)
class SolveResponse:
    verdict: str
    binding_constraint: str
    binding_explanation: str
    projected_finish_s: float
    goal_finish_s: float
    margin_s: float
    models: list[DisciplineModel]
    predictions: list[DisciplinePrediction]
    load: LoadProjection
    injury: InjuryRisk
    injury_absorbers: list[AbsorberOption]
    relaxations: list[RelaxationOption]
    cheapest_fix: RelaxationOption | None
    warnings: list[str]
