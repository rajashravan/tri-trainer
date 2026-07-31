from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

from core import defaults, solve, week
from core.types import (
    DISCIPLINES,
    Allocation,
    DaySlot,
    WeekTemplate,
    AthleteProfile,
    Effort,
    GoalSpec,
    SolveRequest,
    SolveResponse,
    SolverSettings,
)

app = FastAPI()

ALLOCATION_TOLERANCE_H = 0.05


class EffortIn(BaseModel):
    distance_m: float = Field(gt=0, le=250_000)
    duration_s: float = Field(gt=0, le=86_400)


class ProfileIn(BaseModel):
    age_years: int = Field(ge=14, le=90)
    sex: Literal["male", "female", "unspecified"]
    height_cm: float = Field(ge=120, le=230)
    mass_kg: float = Field(ge=35, le=200)
    current_weekly_hours: float = Field(ge=0, le=30)


class AllocationIn(BaseModel):
    swim_h: float = Field(ge=0, le=30)
    bike_h: float = Field(ge=0, le=30)
    run_h: float = Field(ge=0, le=30)


class GoalIn(BaseModel):
    total_s: float = Field(gt=0, le=200_000)
    swim_s: float = Field(gt=0)
    bike_s: float = Field(gt=0)
    run_s: float = Field(gt=0)


class SettingsIn(BaseModel):
    acwr_flag_threshold: float = Field(default=1.5, gt=0, le=5)
    max_weekly_ctl_ramp: float = Field(default=8.0, gt=0, le=50)
    tight_margin_frac: float = Field(default=0.02, ge=0, le=0.5)
    tri_run_penalty_frac: float = Field(default=0.06, ge=0, le=0.5)
    injury_base_pct: float = Field(default=3.0, ge=0, le=100)
    injury_ceiling_pct: float = Field(default=65.0, ge=0, le=100)
    injury_midpoint_acwr: float = Field(default=1.45, gt=0, le=5)
    injury_steepness: float = Field(default=5.5, gt=0, le=50)


class DaySlotIn(BaseModel):
    discipline: Literal["swim", "bike", "run"] | None = None
    is_long: bool = False


class WeekTemplateIn(BaseModel):
    days: list[DaySlotIn]


class SolveIn(BaseModel):
    profile: ProfileIn
    race: Literal["sprint", "olympic", "half", "full"]
    efforts: dict[str, list[EffortIn]]
    weeks_until_race: int = Field(ge=1, le=104)
    weekly_hours_available: float = Field(ge=0, le=30)
    allocation: AllocationIn
    goal: GoalIn
    settings: SettingsIn = SettingsIn()
    week_template: WeekTemplateIn | None = None
    blackout_days: list[tuple[int, int]] = []
    injury_target_pct: float | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def check(self) -> "SolveIn":
        for d in DISCIPLINES:
            n = len(self.efforts.get(d, []))
            if not 1 <= n <= 2:
                raise ValueError(f"{d}: give one or two efforts, got {n}")

        allocated = self.allocation.swim_h + self.allocation.bike_h + self.allocation.run_h
        if abs(allocated - self.weekly_hours_available) > ALLOCATION_TOLERANCE_H:
            raise ValueError(
                f"allocation sums to {allocated:.2f} h but the weekly budget is "
                f"{self.weekly_hours_available:.2f} h"
            )

        if self.week_template is not None:
            if len(self.week_template.days) != 7:
                raise ValueError("week template must have exactly 7 days")
            if not any(d.discipline for d in self.week_template.days):
                raise ValueError("week template needs at least one training day")

        for w, d in self.blackout_days:
            if not 0 <= d <= 6:
                raise ValueError(f"blackout day index {d} is outside Mon-Sun")
            if not 0 <= w < self.weeks_until_race:
                raise ValueError(f"blackout week {w + 1} is outside the training block")

        # No world-record floor on goal splits: exploring an impossible goal is a
        # legitimate thing to do here, and the verdict already says it is unreachable.
        # Blocking the move stops the tool answering the question it exists to answer.
        return self


def to_domain(payload: SolveIn) -> SolveRequest:
    return SolveRequest(
        profile=AthleteProfile(**payload.profile.model_dump()),
        race=payload.race,
        efforts={
            d: [Effort(e.distance_m, e.duration_s) for e in payload.efforts[d]]
            for d in DISCIPLINES
        },
        weeks_until_race=payload.weeks_until_race,
        weekly_hours_available=payload.weekly_hours_available,
        allocation=Allocation(**payload.allocation.model_dump()),
        goal=GoalSpec(**payload.goal.model_dump()),
        settings=SolverSettings(**payload.settings.model_dump()),
        week_template=(
            WeekTemplate(days=[DaySlot(d.discipline, d.is_long) for d in payload.week_template.days])
            if payload.week_template is not None
            else week.default_template()
        ),
        blackout_days=[(int(w), int(d)) for w, d in payload.blackout_days],
    )


@app.post("/api/solve", response_model=SolveResponse)
def post_solve(payload: SolveIn) -> SolveResponse:
    try:
        return solve.solve(to_domain(payload), payload.injury_target_pct)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
