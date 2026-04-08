# CLAUDE.md

## Project

**MyRestaurantReviews** — a personal restaurant tracking app. Track restaurants visited with reviews, maintain a wishlist, and get AI-powered recommendations.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, TailwindCSS, RTK Query, React Hook Form |
| Backend | FastAPI, Python, SQLAlchemy 2.0 (async), PostgreSQL, Alembic, Pydantic 2 |
| Auth | fastapi-users, JWT (Bearer token) |
| Shared | platform_shared (backend), @platform/ui (frontend) |

## Directory Map

```
backend/app/
  main.py                 # FastAPI init, route registration, CORS
  core/                   # Config, auth, security
  db/session.py           # AsyncSession factory (via platform_shared)
  api/                    # Route handlers
  models/                 # SQLAlchemy ORM
  schemas/                # Pydantic schemas
  repositories/           # DB queries
  services/               # Business logic

frontend/src/
  main.tsx                # React entry point
  App.tsx                 # Router
  app/pages/              # Route components
  app/features/           # Domain feature components
```

## Commands

**Frontend** (from `frontend/`):
```bash
npm run dev      # Dev server on :5174
npm run build    # TypeScript check + Vite build
```

**Backend** (from `backend/`):
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8001
alembic revision --autogenerate -m "description"
alembic upgrade head
```

## Ports

- Frontend dev: **5174** (not 5173 — avoids collision with MyBookkeeper)
- Backend API: **8001** (not 8000)
- PostgreSQL: **5433** (not 5432)
