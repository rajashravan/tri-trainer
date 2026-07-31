from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

from core import defaults, solve
from core.types import (
    DISCIPLINES,
    Allocation,
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


class SolveIn(BaseModel):
    profile: ProfileIn
    race: Literal["sprint", "olympic", "half", "full"]
    efforts: dict[str, list[EffortIn]]
    weeks_until_race: int = Field(ge=1, le=104)
    weekly_hours_available: float = Field(ge=0, le=30)
    allocation: AllocationIn
    goal: GoalIn
    settings: SettingsIn = SettingsIn()

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

        race = defaults.race_def(self.race)
        for d in DISCIPLINES:
            floor = defaults.min_plausible_time_s(d, race.distance(d))
            if getattr(self.goal, f"{d}_s") < floor:
                raise ValueError(f"{d} goal split is faster than a world record")
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
    )


@app.post("/api/solve", response_model=SolveResponse)
def post_solve(payload: SolveIn) -> SolveResponse:
    try:
        return solve.solve(to_domain(payload))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
