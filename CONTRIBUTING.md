# Contributing to STRIDEtastic

Thanks for your interest in improving STRIDEtastic! This guide explains how to propose changes, run the stack locally, and get PRs merged smoothly.

## Table of contents
- [Scope](#scope)
- [Code of Conduct](#code-of-conduct)
- [Architecture quick recap](#architecture-quick-recap)
- [Local development](#local-development)
- [Pre-commit hooks](#pre-commit-hooks)
- [Backend workflow](#backend-workflow)
- [Frontend workflow](#frontend-workflow)
- [Testing expectations](#testing-expectations)
- [Style and quality](#style-and-quality)
- [Branches and PRs](#branches-and-prs)
- [Issue reports](#issue-reports)
- [Releases and changelog](#releases-and-changelog)

## Scope
STRIDEtastic is for authorized research and observability of Meshtastic meshes.

## Code of Conduct
Participation is governed by the Contributor Covenant (see `CODE_OF_CONDUCT.md`).

## Architecture quick recap
- **Backend**: Django 5.1 + Django-Ninja API, Celery workers, Redis, TimescaleDB/PostgreSQL; Python 3.12 target.
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind.
- **Infrastructure**: Docker Compose stack wires DB, API, Celery worker/beat, Redis, frontend, and Grafana.

## Local development
Clone the repo and choose either Docker or native workflows.

### Docker Compose (fast start)
```bash
cp .env.template .env
# Configure MQTT/serial settings as needed

# Start DB first
docker compose up -d timescale_stridetastic

# Apply migrations and create admin
docker compose run --rm api_stridetastic python /app/manage.py migrate
docker compose run --rm api_stridetastic python /app/manage.py createsuperuser

# (Optional) seed defaults
docker compose run --rm api_stridetastic python /app/manage.py seeds

# Bring up the full stack
docker compose up -d
```
Services: Dashboard http://localhost:3000, API/Swagger http://localhost:8000, Admin http://localhost:8000/admin, Grafana http://localhost:3001.

### Native backend
```bash
cd api_stridetastic
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```
You need PostgreSQL/TimescaleDB and Redis reachable; adjust `DATABASE_URL` and Redis settings in your environment.

### Native frontend
```bash
cd web_stridetastic
pnpm install
pnpm dev
```
Set `NEXT_PUBLIC_API_HOST_IP` (and other envs) to point at your API.

## Pre-commit hooks
- Install tooling once: `pip install pre-commit` (inside your virtualenv), then run `pre-commit install` at the repo root.
- Run checks locally before pushing: `pre-commit run --all-files`.
- Hooks cover ruff, black, isort, trailing whitespace/end-of-file fixes, YAML checks, and secret detection. This mirrors what CI enforces.

## Backend workflow
- Run tests: `pytest` (from `api_stridetastic`).
- Lint/format: use `ruff` and `black` if installed; keep imports tidy with `isort`.
- Migrations: `python manage.py makemigrations` then `python manage.py migrate`. Include migration files in PRs when models change.
- Seeds: `python manage.py seeds` for default data.

## Frontend workflow
- Type check: `pnpm typecheck` (if configured) or `pnpm build`.
- Lint: `pnpm lint` (ESLint).
- Tests: `pnpm test` (or `pnpm vitest`/`pnpm jest` depending on config).
- Build: `pnpm build` before releasing major UI changes.

## Testing expectations
- Add/adjust tests for any behavior change (backend pytest, frontend unit/component tests).
- For bug fixes, include a regression test when feasible.
- For UI changes, include screenshots or short notes in the PR template.

## Style and quality
- Python: type-friendly, small functions, clear naming; prefer dependency injection over globals. Keep docstrings for public functions.
- TypeScript/React: functional components, hooks where appropriate, avoid prop drilling by using contexts already present.
- Security: never commit secrets; keep RF/legal constraints in mind; default to least-privilege configs.
- Docs: update relevant markdown (README, CLAUDE.md pointers, dashboards docs) when altering features.

## Branches and PRs
- Base branch is `main`.
- Use feature branches: `feature/<short-desc>` or `fix/<short-desc>`.
- Keep PRs scoped; prefer smaller changes over large bundles.
- PR checklist: tests pass, lint passes, migrations included (if any), docs updated, screenshots for UI changes.
- Expect review before merge; address feedback with follow-up commits (no force-push needed unless requested).

## Issue reports
- Provide reproduction steps, expected vs actual behavior, environment (OS, Python/Node versions), and logs/traces if available.
- Tag whether it affects backend, frontend, or infrastructure.

## Releases and changelog
- Tags/releases are cut from `main`.
- Update `CHANGELOG.md` (or release notes) when releasing features or fixes. Contributors do not need to edit changelog unless requested during review.
