"""
Week template and recovery adequacy.

The template is an INPUT: how the athlete's typical week is laid out. Spacing drives
recovery, recovery drives how steep a ramp the body can absorb, so a badly-spaced week
tightens the safe ramp ceiling. It is not a plan the solver prints.

All wrap-around: the week repeats, so a Sunday long ride followed by a Monday long run
is back-to-back and scored as such.
"""

from core.types import DaySlot, RecoveryScore, WeekTemplate

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

LONG_SESSION_WEIGHT = 2.0
NORMAL_SESSION_WEIGHT = 1.0

# Penalty weights. Tunable; see the caveat in progression.py — same caveat applies.
HARD_STACK_PENALTY = 0.18
LONG_BLOCK_PENALTY = 0.10
SAME_DISCIPLINE_PENALTY = 0.12
NO_REST_PENALTY = 0.15
MIN_MULTIPLIER = 0.35


def _longest_run(flags: list[bool]) -> int:
    """Longest unbroken run of True, wrapping around the week."""
    if all(flags):
        return len(flags)
    if not any(flags):
        return 0
    doubled = flags + flags
    best = run = 0
    for f in doubled:
        run = run + 1 if f else 0
        best = max(best, run)
    return min(best, len(flags))


def _min_same_discipline_gap(days: list[DaySlot]) -> int:
    """Smallest circular gap in days between two sessions of the same discipline."""
    best = 7
    for discipline in ("swim", "bike", "run"):
        idx = [i for i, d in enumerate(days) if d.discipline == discipline]
        if len(idx) < 2:
            continue
        for a, b in zip(idx, idx[1:] + [idx[0] + 7]):
            best = min(best, b - a)
    return best


def session_weights(template: WeekTemplate) -> list[float]:
    """Relative share of the week's stress each day carries."""
    return [
        0.0
        if d.discipline is None
        else (LONG_SESSION_WEIGHT if d.is_long else NORMAL_SESSION_WEIGHT)
        for d in template.days
    ]


def score(template: WeekTemplate) -> RecoveryScore:
    days = template.days
    training = [d.discipline is not None for d in days]
    hard = [d.discipline is not None and d.is_long for d in days]

    consecutive_hard = _longest_run(hard)
    longest_block = _longest_run(training)
    gap = _min_same_discipline_gap(days)
    rest_days = sum(1 for t in training if not t)

    penalty = 0.0
    reasons: list[str] = []

    # Two long days back to back is normal practice (the classic weekend); three is
    # where stacking starts to outrun recovery.
    if consecutive_hard >= 3:
        penalty += HARD_STACK_PENALTY * (consecutive_hard - 2)
        reasons.append(f"{consecutive_hard} consecutive hard days")
    if longest_block > 5:
        penalty += LONG_BLOCK_PENALTY * (longest_block - 5)
        reasons.append(f"{longest_block} training days without a rest day")
    if gap < 2:
        penalty += SAME_DISCIPLINE_PENALTY * (2 - gap)
        reasons.append("same discipline on back-to-back days")
    if rest_days == 0:
        penalty += NO_REST_PENALTY
        reasons.append("no rest day")

    value = max(MIN_MULTIPLIER, min(1.0, 1.0 - penalty))

    return RecoveryScore(
        value=value,
        ramp_multiplier=value,
        consecutive_hard_days=consecutive_hard,
        longest_training_block=longest_block,
        min_same_discipline_gap=gap,
        rest_days=rest_days,
        reasons=reasons,
    )


def default_template() -> WeekTemplate:
    """A sanely-spaced six-day week: hard days separated, one full rest day."""
    return WeekTemplate(
        days=[
            DaySlot(None, False),      # Mon rest
            DaySlot("swim", False),    # Tue
            DaySlot("bike", False),    # Wed
            DaySlot("run", True),      # Thu long run
            DaySlot("swim", False),    # Fri
            DaySlot("bike", True),     # Sat long ride
            DaySlot(None, False),      # Sun rest
        ]
    )
