# Project

Minimal full-stack scaffold: FastAPI backend + React/Vite frontend.

## Stack

- Backend: Python 3.11+, FastAPI, uvicorn, pytest. Deps in `backend/venv`.
- Frontend: React + Vite, **JavaScript (not TypeScript)**.

## Structure

```
backend/
  core/          # pure Python domain logic — NO fastapi/pydantic imports
  tests/         # pytest
  main.py        # FastAPI app: validates input, calls core, returns result
  requirements.txt
frontend/
  src/           # App.jsx, main.jsx
  vite.config.js # proxies /api -> http://localhost:8000
run.sh           # starts both servers
```

## Architecture rule

All domain logic lives in `backend/core/` as pure functions with no framework
imports. `main.py` is a thin wrapper: it defines Pydantic request/response
models, calls a core function, and returns the result. Keep it that way — new
logic goes in `core/`, not in the endpoint.

Route handlers use `def`, not `async def`.

## Prohibitions

- No database, no auth, no Docker, no CSS framework, no state management library.
- No CORS setup — the Vite proxy makes the browser see one origin.
- Do not add any dependency beyond the stack above without asking first.
- No error boundaries, no logging setup, no config system, no extra files.

## Run

```bash
./run.sh          # backend on :8000, frontend on :5173
```

## Test

```bash
cd backend && ./venv/bin/python -m pytest tests/ -q
```

Run pytest as `python -m pytest` from `backend/` so that `core` is importable.

## API

`POST /api/greet` — `{"name": "..."}` -> `{"message": "...", "timestamp": "..."}`
