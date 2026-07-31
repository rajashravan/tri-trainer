# Ironman Feasibility Solver

Answers one question: **"Is this race goal achievable in the time I have, and if not,
what is the cheapest change that makes it so?"**

Not a plan generator. You give it your recent best efforts, how many weeks and hours you
have, and a goal time; it returns a verdict, names the binding constraint, and offers
concrete relaxations. A training plan falls out as a byproduct.

## Requirements

- Python 3.11+
- Node 18+
- macOS or Linux (`run.sh` is a bash script)

## Setup

Neither `venv/` nor `node_modules/` is checked in, so both need creating once:

```bash
# backend
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cd ..

# frontend
cd frontend
npm install
cd ..
```

## Run

```bash
./run.sh
```

Then open **http://localhost:5173**.

That starts uvicorn on `:8000` and the Vite dev server on `:5173`. Use `:5173` — the
frontend proxies `/api` to the backend, so the browser sees a single origin and there is
no CORS configuration anywhere. Hitting `:8000` directly gives you the API but no UI.

`Ctrl+C` stops both.

Prefer separate terminals:

```bash
cd backend && ./venv/bin/uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

### Port already in use

Vite silently falls back to `:5174` if `:5173` is taken, which is easy to miss. To clear
both ports:

```bash
lsof -ti:8000,5173 | xargs kill
```

## Test

```bash
cd backend
./venv/bin/python -m pytest tests/ -q
```

The `python -m` form matters — it puts `backend/` on the import path so `core` resolves.
Plain `pytest tests/` fails with `ModuleNotFoundError: No module named 'core'`.

Frontend has no test suite; typecheck it with:

```bash
cd frontend && ./node_modules/.bin/tsc --noEmit
```

## Layout

```
backend/
  core/          pure Python domain logic — no framework imports
    riegel.py          cross-distance time scaling
    critical_speed.py  two-parameter CS/D' fit from two efforts
    progression.py     hours + weeks -> plausible improvement  (the load-bearing heuristic)
    load.py            CTL / ATL / ACWR projection
    week.py            week template + recovery adequacy scoring
    schedule.py        per-day grid, session prescription, blackout redistribution
    injury.py          injury chance and its inverse solve
    feasibility.py     verdict, margin, binding constraint
    relax.py           relaxation search ("cheapest fix")
    solve.py           orchestrator — the only module main.py imports
  tests/         pytest
  main.py        FastAPI: Pydantic validation, one endpoint, thin wrapper
frontend/
  src/
    onboarding/  3-step wizard, every field pre-seeded
    dashboard/   verdict, split bar, week template, heatmap, injury panel
run.sh
SPEC.md         design spec, modelling decisions, open questions
```

## Architecture rule

All domain logic lives in `backend/core/` as pure functions with no framework imports.
`main.py` defines request/response models, calls one core function, and returns the
result. New logic goes in `core/`, not in the endpoint. Route handlers use `def`, not
`async def`.

## API

A single stateless endpoint. Full config in, full result out — no database, no sessions.

`POST /api/solve` — see `SPEC.md` §3 for the request and response shape, or
http://localhost:8000/docs for the generated Swagger UI once the backend is running.

Recompute is ~13ms including the relaxation search, against a 100ms budget. There are no
LLM calls anywhere in the solve path.

## A note on the model

Riegel scaling and critical speed are standard. The progression model
(`core/progression.py`) and the injury-chance curve (`core/injury.py`) are **engineering
heuristics, not validated physiology** — shaped to be monotone, saturating, and plausible
in magnitude. Both are isolated behind single functions with their constants exposed in
`SolverSettings` so they can be replaced without touching the solver. `SPEC.md` §10 lists
the open modelling questions.
