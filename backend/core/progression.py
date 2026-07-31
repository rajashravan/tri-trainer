"""
How training hours become speed.

⚠️ THIS IS THE LOAD-BEARING HEURISTIC. Riegel and critical speed are standard;
this module is not. The constants are shaped to be monotonic, saturating, and to
produce plausible magnitudes — they are not validated physiology. The entire
feasibility verdict rests on this function, which is why it lives alone behind one
call and every constant is exposed in SolverSettings.
"""

import math

from core.types import SolverSettings


def _clamp(x: float, lo: float, hi: float) -> float:
    return min(max(x, lo), hi)


def weekly_stress(hours: float, intensity_factor: float) -> float:
    """TSS-style: 100 points per hour at threshold, scaling with intensity squared."""
    return 100.0 * hours * intensity_factor**2


def current_load(discipline: str, profile_weekly_hours: float, share: float,
                 settings: SolverSettings) -> float:
    """
    Chronic load the athlete is carrying now, in CTL points.

    Assumes their current hours are split the same way as their planned allocation —
    the best available proxy, since we never ask how they currently split their time.
    CTL converges to mean daily load, hence the /7.
    """
    hours = profile_weekly_hours * share
    return weekly_stress(hours, settings.mean_intensity_factor[discipline]) / 7.0


def age_factor(age_years: int) -> float:
    """Adaptation rate declines with age. Directionally well-attested; the slope is not."""
    return _clamp(1.0 - 0.005 * max(0, age_years - 35), 0.75, 1.0)


def plausible_speed_gain(discipline: str, hours: float, weeks: int, load_now: float,
                         age_years: int, settings: SolverSettings) -> float:
    """
    Fractional gain in threshold speed over the block. Saturating in stimulus, and
    ceilinged by how much headroom the athlete has left.
    """
    ceiling = (
        settings.g_ceiling[discipline]
        * _clamp(1.0 - load_now / settings.ctl_reference[discipline], 0.25, 1.0)
        * age_factor(age_years)
    )
    # Weekly volume and block length are NOT interchangeable. A plain hours*weeks
    # product makes them so, which would leave the relaxation search choosing between
    # two identical levers. The sub-linear exponent on weeks encodes that extending a
    # block has diminishing returns relative to raising weekly volume.
    stimulus = max(0.0, hours) * max(0, weeks) ** settings.weeks_exponent
    return ceiling * (1.0 - math.exp(-stimulus / settings.tau[discipline]))


def time_reduction(speed_gain: float) -> float:
    """
    Convert a fractional SPEED gain to a fractional TIME reduction. These are not the
    same number, and conflating them is the easiest correctness bug in this codebase.
    """
    return speed_gain / (1.0 + speed_gain)
