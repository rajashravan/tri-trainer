# Ironman Feasibility Solver — Design Spec

**Core question:** *"Is this goal achievable in the time I have, and if not, what is
the cheapest change that makes it so?"* The training plan is a byproduct, not the
product.

---

## 0. Stack delta from current CLAUDE.md

Three deliberate overrides of the existing scaffold, called out so they are not silent:

| CLAUDE.md today | This spec | Action |
|---|---|---|
| Frontend is **JavaScript** | **TypeScript** | Migrate `src/` to `.tsx`, add `typescript`, `@types/react`, `@types/react-dom` |
| No dependency without asking | **Recharts** | New dependency, explicitly requested |
| — | Still no DB, no auth, no persistence, no state library | Unchanged |

Everything else holds: domain logic is pure Python in `backend/core/`, `main.py` is a
thin wrapper, route handlers use `def`.

**Performance contract.** "Closed-form only" is interpreted as: no iterative
optimizers, no numerical solvers, no LLM calls anywhere in the recompute path. A
bounded deterministic recurrence (the daily EWMA over ≤365 steps) and a bounded grid
scan (≤50 points per relaxation axis) are permitted — both are microseconds in pure
Python. Total solve budget: **<10ms**, giving 10× headroom on the 100ms target.

---

## 1. Domain model

### 1.1 Riegel scaling

`T2 = T1 * (D2/D1)^k`

- **Two efforts** → exact closed-form solve, `k = ln(T2/T1) / ln(D2/D1)`. (With
  exactly two points, log-log regression degenerates to this; no regression needed.
  The regression path only matters if we later accept 3+ efforts.)
- **One effort** → discipline default `k`.
- **Clamp `k` to [1.00, 1.15]** regardless of source. Two noisy efforts routinely
  produce absurd exponents (`k < 1` implies you get faster per unit distance as
  distance grows). Clamping is reported in `fit_source` so the UI can say the fit was
  overridden.

Defaults: swim `1.03`, bike `1.05`, run `1.06`.

### 1.2 Critical speed

Two-parameter linear distance–time model: `d = CS * t + D'`

From two efforts `(d₁,t₁), (d₂,t₂)` with `t₂ > t₁`:

```
CS = (d₂ - d₁) / (t₂ - t₁)        # m/s, threshold
D' = d₁ - CS * t₁                 # m, finite work capacity above CS
```

Valid only if `CS > 0` and `D' > 0`. On degenerate input, fall back to Riegel and set
`fit_source = "riegel_fitted"`.

With **one effort**, there is no CS fit. Fall back: Riegel-predict the distance the
athlete would cover in 60 minutes, and take `CS = that distance / 3600`. Set
`fit_source = "riegel_default"`, `d_prime_m = None`, and suppress zone display.

**Zones** as fractions of CS: Z1 <0.80, Z2 0.80–0.88, Z3 0.88–0.95, Z4 0.95–1.02,
Z5 >1.02.

### 1.3 Training load

Per-session stress, TSS-style:

```
stress = 100 * duration_h * intensity_factor²        # IF = speed / CS
```

Weekly discipline stress from allocated hours at a discipline-typical mean IF
(`0.78` swim, `0.75` bike, `0.80` run — endurance-block averages, tunable in
settings):

```
weekly_stress_d = 100 * hours_d * IF_d²
```

Chronic and acute EWMAs over daily load `L = weekly_stress / 7`:

```
CTL_t = CTL_{t-1} + (L_t - CTL_{t-1}) / 42
ATL_t = ATL_{t-1} + (L_t - ATL_{t-1}) / 7
ACWR_t = ATL_t / CTL_t
```

Seeded from the athlete's *current* implied load so week 1 is not a cold start:
`CTL_0 = ATL_0 = current_weekly_stress / 7`, where current weekly stress is inferred
from a `current_weekly_hours` onboarding field.

Analytic anchor for constant load: `CTL_n = L + (CTL_0 - L)(1 - 1/42)^n`. The
implementation uses the daily recurrence because the load ramps.

**Ramp rate** = max week-over-week CTL increase across the block, in CTL points/week.

### 1.4 Ramp constraint and the injury question

Two distinct mechanisms, deliberately separated:

- **HARD constraint (solver):** `peak_weekly_ctl_ramp <= max_weekly_ctl_ramp`
  (default `8.0` CTL/week). A plan requiring a steeper ramp is reported
  **infeasible**. It is never printed as a plan.
- **SOFT flag (display):** `peak_ACWR > acwr_flag_threshold` (default `1.5`, exposed
  as a user-adjustable numeric input, always visible with its current value).

**No calibrated injury probability is emitted anywhere in the API or the UI.** The
response carries a fixed note string:

> "Ramp-rate flag against a threshold of {threshold}. Acute:chronic ratio thresholds
> are contested in the sports science literature; treat this as a heuristic guardrail,
> not a risk estimate."

### 1.5 Progression model — *the load-bearing heuristic*

How hours + weeks become improvement. Saturating exponential with a headroom ceiling:

```
stimulus_d      = hours_d * weeks ** weeks_exponent            # weeks_exponent = 0.85
g_d             = g_max_d * (1 - exp(-stimulus_d / tau_d))     # fractional SPEED gain
```

**Why the exponent on weeks.** A plain `hours * weeks` product makes the two controls
mathematically interchangeable: scaling either by 1.75 produces an identical result,
so `+12 weeks` and `+6 h/week` return the *same* projected finish and the relaxation
search picks arbitrarily between two identical levers. The sub-linear exponent encodes
that extending a block has diminishing returns relative to raising weekly volume, and
keeps the axes distinguishable. Locked by a regression test.

- `tau_d` — stimulus constant to reach 63% of ceiling.
  Defaults: swim `26`, bike `73`, run `46`.
- `g_max_d` — ceiling on fractional speed gain over the block:
  `g_max_d = g_ceiling_d * headroom_factor * age_factor`
  - `g_ceiling_d`: swim `0.20`, bike `0.15`, run `0.13` (swim is most
    technique-limited and therefore has the most upside for an untrained swimmer).
  - `headroom_factor = clamp(1 - CTL_0 / ctl_reference_d, 0.25, 1.0)` — an athlete
    already carrying high chronic load has less left to gain.
  - `age_factor` — see §1.6.

**Speed gain → time reduction** (these are not the same number, and conflating them
is the most likely correctness bug in the build):

```
time_reduction_frac = g / (1 + g)
```

> ⚠️ **These constants are engineering heuristics, not validated physiology.** They
> are shaped to be monotonic, saturating, and to produce plausible magnitudes. They
> are isolated in `core/progression.py` behind one function so the entire model can be
> replaced without touching the solver. All are exposed in `SolverSettings` and
> surfaced in a "model assumptions" drawer in the UI. See Open Questions.

### 1.6 What the basic profile actually does — honest accounting

The spec asks for gender, height, weight, age. Truthfully:

| Field | Used? | Justification |
|---|---|---|
| `mass_kg` | **No** | Would matter if bike were modeled in watts and converted via power-to-mass over a course profile. We model speed directly from the athlete's own time trial, which already embeds their mass. Adding a mass term would double-count. |
| `height_cm` | **No** | No defensible closed-form link to endurance performance at this fidelity. |
| `sex` | **No** | The athlete's own effort data already encodes their current capability. Applying a population-level sex coefficient on top of measured personal performance would be double-counting, and would make identical inputs produce different predictions based on a demographic field. |
| `age_years` | **Weakly, one place** | `age_factor = clamp(1 - 0.005 * max(0, age - 35), 0.75, 1.0)` on the improvement ceiling only. Adaptation rate declining with age is well-attested directionally; the specific coefficient is not. |

All four are collected (they cost ~5 seconds and users expect them), stored, and
echoed back. Only `age_years` reaches the math. The UI labels the age effect
"weak prior — adjustable" next to the slider. **Do not add dependence on the other
three to make the model look richer.**

### 1.7 Race model

| Race | swim_m | bike_m | run_m | transition_s |
|---|---|---|---|---|
| sprint | 750 | 20000 | 5000 | 240 |
| olympic | 1500 | 40000 | 10000 | 300 |
| half | 1900 | 90000 | 21100 | 480 |
| full | 3800 | 180000 | 42200 | 600 |

Projected finish = Σ per-discipline projected times + `transition_s`.

**Run-off-the-bike penalty.** The run split is predicted from standalone road efforts,
which is systematically optimistic — a triathlon run is materially slower than the same
athlete's open half-marathon. Applied as a multiplier on the run leg only:

```
run_time *= (1 + tri_run_penalty_frac)        # default 0.06
```

Treated exactly like the ACWR threshold: **visible, user-adjustable in the model
assumptions drawer, and labeled a heuristic.** The 6% figure is a reasonable
half-distance estimate, not a validated constant. It is applied to the *predicted
current* time, so it shifts the baseline rather than the improvement math.

---

## 2. Types (`backend/core/types.py`)

```python
from dataclasses import dataclass, field
from typing import Literal

Discipline = Literal["swim", "bike", "run"]
RaceKey = Literal["sprint", "olympic", "half", "full"]
Verdict = Literal["feasible", "tight", "infeasible"]
FitSource = Literal["critical_speed", "riegel_fitted", "riegel_default"]
ControlKey = Literal["weeks", "weekly_hours", "goal_time"]

# ---------- input ----------

@dataclass(frozen=True)
class Effort:
    distance_m: float
    duration_s: float

@dataclass(frozen=True)
class AthleteProfile:
    age_years: int
    sex: Literal["male", "female", "unspecified"]
    height_cm: float
    mass_kg: float
    current_weekly_hours: float          # seeds CTL_0

@dataclass(frozen=True)
class Allocation:
    swim_h: float
    bike_h: float
    run_h: float                          # invariant: sums to weekly_hours_available

@dataclass(frozen=True)
class GoalSpec:
    total_s: float
    swim_s: float
    bike_s: float
    run_s: float                          # invariant: components + transition == total

@dataclass(frozen=True)
class SolverSettings:
    acwr_flag_threshold: float = 1.5
    max_weekly_ctl_ramp: float = 8.0
    tight_margin_frac: float = 0.02
    tri_run_penalty_frac: float = 0.06    # run-off-the-bike; heuristic, user-adjustable
    weeks_exponent: float = 0.85          # keeps weeks and hours from collapsing into one lever
    riegel_k_default: dict[str, float] = field(default_factory=lambda: {"swim": 1.03, "bike": 1.05, "run": 1.06})
    mean_intensity_factor: dict[str, float] = field(default_factory=lambda: {"swim": 0.78, "bike": 0.75, "run": 0.80})
    tau: dict[str, float] = field(default_factory=lambda: {"swim": 26.0, "bike": 73.0, "run": 46.0})
    g_ceiling: dict[str, float] = field(default_factory=lambda: {"swim": 0.20, "bike": 0.15, "run": 0.13})
    ctl_reference: dict[str, float] = field(default_factory=lambda: {"swim": 45.0, "bike": 75.0, "run": 60.0})

@dataclass(frozen=True)
class SolveRequest:
    profile: AthleteProfile
    race: RaceKey
    efforts: dict[str, list[Effort]]      # keyed by Discipline, 1..2 entries each
    weeks_until_race: int
    weekly_hours_available: float
    allocation: Allocation
    goal: GoalSpec
    settings: SolverSettings

# ---------- derived ----------

@dataclass(frozen=True)
class DisciplineModel:
    discipline: Discipline
    critical_speed_mps: float
    d_prime_m: float | None
    riegel_k: float
    fit_source: FitSource
    k_was_clamped: bool
    zones_mps: dict[str, tuple[float, float]]

@dataclass(frozen=True)
class DisciplinePrediction:
    discipline: Discipline
    predicted_current_s: float
    goal_s: float
    projected_s: float
    required_time_reduction_pct: float
    plausible_time_reduction_pct: float
    headroom_pct: float                   # plausible - required; negative == short
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
    ramp_flag: bool                       # soft, ACWR-based
    ramp_hard_violation: bool             # hard, CTL-ramp-based
    ramp_note: str

@dataclass(frozen=True)
class RelaxationOption:
    control: ControlKey
    delta: float
    human: str                            # "+4 weeks" / "+90 min/week" / "goal 11 min slower"
    resulting_verdict: Verdict
    resulting_margin_s: float
    normalized_cost: float                # steps of natural unit; see §5.2

@dataclass(frozen=True)
class PlannedWeek:
    week_index: int
    swim_h: float
    bike_h: float
    run_h: float
    target_ctl: float
    focus: str

@dataclass(frozen=True)
class SolveResponse:
    verdict: Verdict
    binding_constraint: str
    binding_explanation: str
    projected_finish_s: float
    goal_finish_s: float
    margin_s: float                       # goal - projected; negative == short
    models: list[DisciplineModel]
    predictions: list[DisciplinePrediction]
    load: LoadProjection
    relaxations: list[RelaxationOption]
    cheapest_fix: RelaxationOption | None
    snap_target: SolveRequest | None      # None when already feasible
    plan: list[PlannedWeek]
    warnings: list[str]
```

---

## 3. API contract — `POST /api/solve`

Stateless. Full config in, full result out. `main.py` mirrors these dataclasses as
Pydantic models, validates, calls `core.solve.solve()`, returns.

### Request

```json
{
  "profile": {
    "age_years": 40, "sex": "male", "height_cm": 178,
    "mass_kg": 75, "current_weekly_hours": 5.0
  },
  "race": "half",
  "efforts": {
    "swim": [{"distance_m": 400, "duration_s": 420},
             {"distance_m": 1500, "duration_s": 1680}],
    "bike": [{"distance_m": 20000, "duration_s": 2160},
             {"distance_m": 40000, "duration_s": 4500}],
    "run":  [{"distance_m": 5000, "duration_s": 1350},
             {"distance_m": 10000, "duration_s": 2820}]
  },
  "weeks_until_race": 16,
  "weekly_hours_available": 8.0,
  "allocation": {"swim_h": 1.5, "bike_h": 4.0, "run_h": 2.5},
  "goal": {"total_s": 18000, "swim_s": 1946, "bike_s": 9600, "run_s": 5974},
  "settings": {"acwr_flag_threshold": 1.5, "max_weekly_ctl_ramp": 8.0,
               "tri_run_penalty_frac": 0.06}
}
```

`settings` is optional; omitted keys take defaults.

### Response

```json
{
  "verdict": "infeasible",
  "binding_constraint": "run_headroom",
  "binding_explanation": "Run requires a 9.6% improvement; 4.1% is plausible in 16 weeks at 2.5 h/week.",
  "projected_finish_s": 19080.0,
  "goal_finish_s": 18000.0,
  "margin_s": -1080.0,
  "models": [
    {"discipline": "swim", "critical_speed_mps": 0.873, "d_prime_m": 33.3,
     "riegel_k": 1.049, "fit_source": "critical_speed", "k_was_clamped": false,
     "zones_mps": {"z1": [0.0, 0.698], "z2": [0.698, 0.768], "z3": [0.768, 0.829],
                   "z4": [0.829, 0.890], "z5": [0.890, 1.400]}}
  ],
  "predictions": [
    {"discipline": "run", "predicted_current_s": 6610.0, "goal_s": 5974.0,
     "projected_s": 6339.0, "required_time_reduction_pct": 9.62,
     "plausible_time_reduction_pct": 4.10, "headroom_pct": -5.52,
     "allocated_hours": 2.5, "share_of_projected_time_pct": 33.2, "is_binding": true}
  ],
  "load": {
    "weekly_ctl": [52.1, 55.3], "weekly_atl": [54.0, 61.2], "weekly_acwr": [1.04, 1.11],
    "peak_weekly_ctl_ramp": 4.2, "peak_acwr": 1.31,
    "ramp_flag": false, "ramp_hard_violation": false,
    "ramp_note": "Ramp-rate flag against a threshold of 1.5. Acute:chronic ratio thresholds are contested in the sports science literature; treat this as a heuristic guardrail, not a risk estimate."
  },
  "relaxations": [
    {"control": "weeks", "delta": 5, "human": "+5 weeks",
     "resulting_verdict": "feasible", "resulting_margin_s": 61.0, "normalized_cost": 5.0},
    {"control": "weekly_hours", "delta": 2.0, "human": "+2 h/week",
     "resulting_verdict": "tight", "resulting_margin_s": 12.0, "normalized_cost": 8.0},
    {"control": "goal_time", "delta": 780, "human": "goal 13 min slower",
     "resulting_verdict": "feasible", "resulting_margin_s": 38.0, "normalized_cost": 13.0}
  ],
  "cheapest_fix": {"control": "weeks", "delta": 5, "human": "+5 weeks",
                   "resulting_verdict": "feasible", "resulting_margin_s": 61.0,
                   "normalized_cost": 5.0},
  "snap_target": { "...": "a complete SolveRequest with cheapest_fix applied" },
  "plan": [{"week_index": 1, "swim_h": 1.4, "bike_h": 3.7, "run_h": 2.3,
            "target_ctl": 52.1, "focus": "base"}],
  "warnings": ["Bike efforts of 36 and 75 min fall outside the 2-15 min window where the critical-speed model is valid; CS may be underestimated."]
}
```

**Errors.** Validation failures return `422` with
`{"detail": [{"field": "...", "message": "..."}]}`. Rejected *interaction* moves
(§6.1) never reach the API — the frontend blocks them.

---

## 4. Module layout — `backend/core/`

| Module | Responsibility | Key functions |
|---|---|---|
| `types.py` | Dataclasses only. Zero logic. | — |
| `defaults.py` | Race distances, seeded onboarding defaults, `SolverSettings` factory. | `default_request()` |
| `riegel.py` | Exponent fitting and cross-distance time prediction. | `fit_k`, `predict_time` |
| `critical_speed.py` | Two-parameter CS/D′ fit, fallbacks, zone derivation. | `fit_cs`, `zones` |
| `load.py` | Stress scores, CTL/ATL/ACWR recurrence, ramp metrics. | `weekly_stress`, `project_load` |
| `progression.py` | **The heuristic.** Hours+weeks → plausible speed gain. Swappable in isolation. | `plausible_gain` |
| `feasibility.py` | Verdict, margin, binding-constraint selection. | `evaluate` |
| `relax.py` | Grid relaxation search, normalized cost, cheapest fix, snap target. | `search`, `cheapest` |
| `allocate.py` | Zero-sum allocation math, aggregate-delta absorption, absorber detection. | `rebalance`, `absorbers_for` |
| `plan.py` | Week-by-week session table from the solved load curve. | `build_plan` |
| `solve.py` | Orchestrator. `SolveRequest → SolveResponse`. Only module `main.py` imports. | `solve` |

Dependency direction is strictly downward; `solve.py` is the only module that knows
about all the others. No module imports `fastapi` or `pydantic`.

---

## 5. Algorithms

### 5.1 Feasibility

```
function evaluate(req) -> SolveResponse:
    # 1. Fit athlete models
    for d in [swim, bike, run]:
        model[d] = fit_cs(req.efforts[d])  or  riegel_fallback(req.efforts[d])
        k[d]     = fit_k(req.efforts[d], clamp=[1.00, 1.15])

    # 2. Current predicted race split
    for d: current[d] = predict_time(model[d], k[d], race_distance[d])
    current[run] *= (1 + settings.tri_run_penalty_frac)      # run off the bike

    # 3. Load projection over the block
    stress[d]  = 100 * allocation[d] * IF[d]^2
    load       = project_load(CTL_0 from profile.current_weekly_hours,
                              weekly stress ramping to target over block)

    # 4. HARD constraint
    if load.peak_weekly_ctl_ramp > settings.max_weekly_ctl_ramp:
        return verdict=INFEASIBLE, binding="ramp_rate"        # short-circuit

    # 5. Plausible improvement, per discipline
    for d:
        g            = plausible_gain(allocation[d], weeks, model[d], profile.age)
        t_reduction  = g / (1 + g)
        projected[d] = current[d] * (1 - t_reduction)
        required[d]  = (current[d] - goal[d]) / current[d]

    # 6. Aggregate
    projected_finish = sum(projected) + transition_s
    margin           = goal.total_s - projected_finish

    # 7. Verdict
    if margin >= tight_margin_frac * goal.total_s:  verdict = FEASIBLE
    elif margin >= 0:                               verdict = TIGHT
    else:                                           verdict = INFEASIBLE
    if load.ramp_flag and verdict == FEASIBLE:      verdict = TIGHT

    # 8. Binding constraint = discipline with the most negative headroom;
    #    ties or all-positive -> "aggregate_margin"
    binding = argmin_d(plausible[d] - required[d])
```

Verdict thresholds are on the aggregate margin. A discipline can be individually
short while the whole race is still feasible — that is legitimate (over-delivery
elsewhere absorbs it) and the per-discipline headroom column shows it.

### 5.2 Relaxation search

Bounded grid scan per axis. **Not bisection** — the hours axis is non-monotonic
(more hours improves fitness but can trip the hard ramp constraint), so a monotonic
search is unsound here.

```
AXES = {
  weeks:        deltas 1..12 step 1          natural unit = 1 week
  weekly_hours: deltas 0.25..6.0 step 0.25   natural unit = 15 min
  goal_time:    deltas 60..3600 step 60      natural unit = 1 minute
}

function search(req) -> list[RelaxationOption]:
    options = []
    for axis, deltas in AXES:
        for delta in deltas:                      # ascending == cheapest-first
            candidate = apply(req, axis, delta)
            result    = evaluate(candidate)
            if result.verdict in (FEASIBLE, TIGHT):
                options.append(option(axis, delta, result))
                break                             # first success on this axis only
    return options

function cheapest(options) -> RelaxationOption:
    # normalized_cost = delta / natural_unit, i.e. "how many steps of pain"
    # tie-break: prefer FEASIBLE over TIGHT, then prefer larger resulting margin
    return min(options, key=(normalized_cost, verdict_rank, -margin))
```

Cost: 3 axes × ≤24 grid points × one `evaluate` (~50µs) ≈ **<4ms**. Within budget.

`snap_target` is `apply(req, cheapest.control, cheapest.delta)` — a complete
`SolveRequest` the frontend can adopt wholesale, so "Snap to nearest feasible" is a
state replacement, not a second round trip.

### 5.3 Zero-sum allocation and aggregate absorption

```
function rebalance(alloc, changed_d, new_value, budget):
    new_value = clamp(new_value, 0, budget)
    remainder = budget - new_value
    others    = [d for d in disciplines if d != changed_d]
    prior     = sum(alloc[d] for d in others)
    if prior == 0:  split remainder evenly
    else:           alloc[d] = remainder * alloc[d] / prior      # proportional
```

Aggregate controls (`total weekly hours`, `total goal time`) need an **absorber**:

```
function absorbers_for(delta, alloc, budget):
    # a component can absorb if applying the full delta keeps it in [0, budget]
    return [d for d in disciplines if 0 <= alloc[d] + delta <= budget]

# 0 absorbers -> reject the move (§6.1)
# 1 absorber  -> apply automatically, animate that component
# 2+ absorbers -> prompt the user to pick, then apply
```

**Prompting fires on drag-end, never mid-drag.** Both aggregate sliders are continuous
and all three disciplines can usually absorb, so a literal reading of rule 3 would open
a modal on every animation frame of the primary control. Instead: during the drag,
preview the delta distributed proportionally so the verdict updates live; on
`pointerup`, if 2+ absorbers exist, open the absorber popover and commit the user's
choice. One prompt per gesture. If the user dismisses it, the proportional preview
stands.

---

## 6. Interaction rules

### 6.1 Invalid → reject

Validated client-side *before* any request. The move is refused, the slider snaps
back, shakes, flashes red, and a toast names the reason.

| Rule | Message |
|---|---|
| `weekly_hours < 0` or `> 30` | "Weekly hours must be between 0 and 30." |
| `weeks < 1` or `> 104` | "Weeks until race must be between 1 and 104." |
| allocation component `< 0` or `> budget` | "Allocation must stay within your weekly budget." |
| goal split faster than world record for that leg | "That swim split would be a world record. Try slower." |
| aggregate delta with **0** absorbers | "No discipline can absorb that change — raise your weekly budget first." |

World-record floors are hard-coded per discipline per race distance in `defaults.py`.

### 6.2 Free variable → recompute, allow infeasible

`weeks_until_race`, `weekly_hours_available`, per-discipline allocation, per-discipline
goal times. Recompute everything downstream. **Infeasible states are permitted and
rendered** — banner turns red, binding constraint is named, relaxation options appear.
Exploring how far off you are is the point of the tool; blocking it would destroy that.

### 6.3 Aggregate control → absorb

Per §5.3: 1 absorber auto-applies with a 250ms highlight animation on the moving
component; 2+ absorbers open a small absorber-choice popover **on drag-end only**;
0 absorbers rejects. Mid-drag the delta is previewed proportionally so the verdict
stays live under the cursor.

### 6.4 Allocation is zero-sum

The three allocation sliders always sum to `weekly_hours_available`. Raising one
proportionally drains the others. Independent sliders would let the user add hours
everywhere and remove all tension from the tool — the scarcity is the product.

---

## 7. Frontend component tree

```
App
├── OnboardingWizard                  # 3 steps, every field pre-seeded
│   ├── StepProfile                   # age, sex, height, mass, current weekly hours
│   ├── StepPerformance               # 3 × EffortPairInput (1–2 efforts per discipline)
│   ├── StepRaceAndGoal               # race, weeks, weekly hours, goal finish
│   └── SkipToSolveButton             # always live — defaults are valid on step 1
└── Dashboard
    ├── VerdictBanner                 # ① full-bleed, 72px type, readable across a room
    │   └── BindingConstraintChip
    ├── RelaxationPanel               # ②
    │   ├── RelaxationOptionCard[]    # "+5 weeks" → resulting verdict
    │   └── SnapToFeasibleButton      # ③ adopts snap_target wholesale
    ├── SensitivityHint               # ④ cheapest single control right now
    ├── ControlRail                   # sticky left rail
    │   ├── WeeksSlider
    │   ├── WeeklyHoursSlider
    │   ├── AllocationTriad           # zero-sum, 3 linked sliders
    │   ├── GoalTimeControls          # aggregate + per-discipline
    │   ├── AbsorberPopover           # only when 2+ absorbers
    │   └── ModelAssumptionsDrawer    # ACWR threshold, ramp cap, progression constants
    ├── ProjectionChart               # ⑤ Recharts: CTL over block, race day marked
    ├── AllocationComparison          # ⑥ Recharts grouped bars:
    │                                 #   hours share | race-time share | headroom
    └── SessionPlan                   # ⑦ last, collapsed by default
```

**State.** One `useReducer` holding the `SolveRequest`, plus `useSolver()` — a hook
that debounces 100ms, aborts the in-flight request via `AbortController`, and retains
the last good `SolveResponse` so the dashboard never blanks mid-drag. No state
library, per the prohibitions.

**Verdict color:** feasible `#0f9d58`, tight `#f4b400`, infeasible `#d93025`. The
banner is the single largest element on the page.

---

## 8. Build phasing — 2 hours in 15-minute blocks

| Block | Time | Deliverable | Done when |
|---|---|---|---|
| 1 | 0:00–0:15 | `types.py`, `defaults.py`, `solve.py` returning a hardcoded stub; `main.py` endpoint; frontend fetch wired | Browser round-trips a stub verdict |
| 2 | 0:15–0:30 | `riegel.py`, `critical_speed.py` + pytest on both | CS/k correct for the seeded defaults |
| 3 | 0:30–0:45 | `load.py`, `progression.py` + pytest | CTL curve and gains are plausible |
| 4 | 0:45–1:00 | `feasibility.py`, wired through `solve.py` | API returns a **real** verdict + binding constraint |
| 5 | 1:00–1:15 | Onboarding wizard, dashboard shell, `VerdictBanner` | Can onboard and see a real verdict |
| 6 | 1:15–1:30 | `ControlRail`, zero-sum `AllocationTriad`, 100ms debounce | Dragging sliders live-updates the verdict |
| 7 | 1:30–1:45 | `relax.py`, `RelaxationPanel`, `SnapToFeasibleButton`, `SensitivityHint` | Infeasible state offers real fixes that work |
| 8 | 1:45–2:00 | `ProjectionChart`, `AllocationComparison`, `SessionPlan`, polish | Charts render; plan collapsed |

**Cut list, first to cut first.** Cut from the bottom of the build, not the middle.

1. `SessionPlan` (⑦) — the explicit byproduct; return `plan: []`
2. `AllocationComparison` (⑥) — the second chart
3. `AbsorberPopover` — auto-absorb proportionally instead of prompting
4. `D'` and zone derivation — CS alone drives everything that matters
5. Personal Riegel `k` fit — use the discipline default
6. `ProjectionChart` (⑤) — degrade to a numeric CTL start/peak/ramp readout
7. `OnboardingWizard` — collapse to one dense pre-filled form + Solve

**Never cut:** the verdict with its binding constraint (①), zero-sum allocation
(§6.4), relaxation options (②). Those three *are* the product. A tool that shows a
verdict and three ways to fix it — with no charts and no plan — is a successful demo.
Charts without a working verdict are not.

---

## 9. Seeded defaults

40y male, 178cm, 75kg, currently 5 h/week. Half Ironman, 16 weeks out, 8 h/week
available, allocation 1.5 / 4.0 / 2.5, goal **5:00:00**.

| Discipline | Effort 1 | Effort 2 | Fitted CS | Fitted k |
|---|---|---|---|---|
| Swim | 400m / 7:00 | 1500m / 28:00 | 0.873 m/s | 1.049 |
| Bike | 20km / 36:00 | 40km / 1:15:00 | 8.55 m/s | 1.059 |
| Run | 5km / 22:30 | 10km / 47:00 | 3.40 m/s | 1.063 |

These fit realistically (`D'` = 33.3m / 1538.5m / 408.2m, all in normal ranges; run `k`
lands at 1.063 against the textbook 1.06). Predicted current half-IM split, **including
the 6% run-off-the-bike penalty** (1:43:56 standalone → 1:50:10 off the bike):

`35:53 + 2:57:00 + 1:50:10 + 8:00 transition = ` **`5:31:03`** (verified numerically).

**The goal is seeded at 5:12:00**, chosen by measurement rather than taste. The
athlete's reachable band under the relaxation grid is **5:04:57 … 5:16:12**; a goal
above `max(weeks-only, hours-only)` is the condition for all three axes to offer a
real fix. 5:12:00 opens `infeasible` at −4:12 and yields exactly three options —
`+10 weeks`, `+3.75 h/week`, `goal 5 min slower` — which is the demo state §2 promises.
A 5:00:00 goal is reachable by *no* combination of weeks and hours, so the panel would
show a single option. Proportional split: swim 33:46, bike 2:46:34, run 1:43:40. The app therefore
opens in a `tight`/`infeasible` state with live relaxation options, demonstrating the
core value proposition on first paint. Opening on "feasible, you're fine" would
demo nothing.

---

## 10. Open questions

Flagged rather than invented:

1. **Progression constants (§1.5) are heuristic, not validated.** `tau`, `g_ceiling`,
   and `ctl_reference` are shaped for plausible magnitude and correct monotonicity.
   This is the single biggest source of modeling error, and the number the whole
   verdict rests on. Isolated in one module for exactly this reason. Should the UI
   present a confidence band rather than a point estimate?
2. ~~Run-off-the-bike fatigue is not modeled.~~ **Resolved:** modeled as a 6%
   multiplier on the run leg, user-adjustable in the assumptions drawer. The
   coefficient remains a guess — it is a plausible half-distance figure, not a
   validated one, and it scales with race distance in reality (a full-distance run
   degrades far more than 6%). Open sub-question: should the default vary by race?
3. **CS fit is biased by effort duration.** The two-parameter model assumes efforts in
   roughly the 2–15 minute range. Our seeded bike efforts (36 and 75 minutes) are well
   outside it, which biases CS low and `D'` high. Should we warn when supplied efforts
   fall outside the valid window?
4. **Normalizing "cheapest fix" across incommensurable units** (§5.2) — 1 week vs 15
   min/week vs 1 minute of goal time. The natural-unit-steps approach is defensible but
   arbitrary; a user who cannot add weeks at all has a different cost function.
   Should the user weight the axes?
5. **Splitting an aggregate goal into per-discipline goals.** Currently proportional to
   the predicted current split. Alternative: allocate the required improvement where
   headroom is greatest, which is smarter but surprising when a slider moves on its own.
6. **Hard ramp cap of 8.0 CTL/week** is a commonly cited figure, not a validated one.
   It is the *hard* constraint, so it directly gates infeasibility verdicts — it
   deserves more scrutiny than the soft ACWR flag that carries the caveat text.
7. **The improvement frontier is narrow.** Across the entire relaxation grid this
   athlete spans only ~11 minutes (5:16:12 → 5:04:57). That is arguably the honest
   output of a saturating model with realistic ceilings — nearly doubling training does
   not halve your race time — but it does mean the controls have modest leverage. A
   wider span would require either implausible improvement ceilings or abandoning
   diminishing returns. Flagged rather than tuned away.
8. **Seeding `CTL_0` from `current_weekly_hours`** assumes the athlete's recent
   training resembles their planned allocation. For someone returning from a layoff
   this materially overstates starting fitness.
