"""Pure domain logic for greetings. No framework imports."""

from datetime import datetime, timezone


def greet(name: str) -> dict:
    """Build a greeting for `name`, defaulting to "world" when blank."""
    cleaned = name.strip() or "world"
    return {
        "message": f"Hello, {cleaned}!",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
