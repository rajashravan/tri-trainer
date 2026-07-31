"""Race definitions and world-record floors. Model constants, not UI seed data."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RaceDef:
    key: str
    label: str
    swim_m: float
    bike_m: float
    run_m: float
    transition_s: float

    def distance(self, discipline: str) -> float:
        return getattr(self, f"{discipline}_m")


RACES: dict[str, RaceDef] = {
    "sprint": RaceDef("sprint", "Sprint", 750, 20000, 5000, 240),
    "olympic": RaceDef("olympic", "Olympic", 1500, 40000, 10000, 300),
    "half": RaceDef("half", "Half (70.3)", 1900, 90000, 21100, 480),
    "full": RaceDef("full", "Full (140.6)", 3800, 180000, 42200, 600),
}


def race_def(key: str) -> RaceDef:
    if key not in RACES:
        raise ValueError(f"unknown race: {key}")
    return RACES[key]


# Elite-plausible speed ceilings (m/s), used as the "faster than a world record"
# rejection floor on goal splits. Deliberately generous — this rejects the absurd,
# not the ambitious.
MAX_SPEED_MPS: dict[str, float] = {"swim": 1.9, "bike": 14.0, "run": 6.2}


def min_plausible_time_s(discipline: str, distance_m: float) -> float:
    return distance_m / MAX_SPEED_MPS[discipline]
