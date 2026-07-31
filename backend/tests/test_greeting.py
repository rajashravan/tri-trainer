from datetime import datetime

from core.greeting import greet


def test_greet_uses_name():
    result = greet("Raja")
    assert result["message"] == "Hello, Raja!"
    datetime.fromisoformat(result["timestamp"])


def test_greet_defaults_to_world_when_blank():
    assert greet("   ")["message"] == "Hello, world!"
