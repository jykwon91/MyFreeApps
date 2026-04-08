# CLAUDE.md

## Project

**MyFreeApps** — a monorepo containing shared infrastructure packages and multiple SaaS web applications.

## Structure

```
MyFreeApps/
├── packages/
│   ├── shared-backend/      # Python: "platform_shared" — auth, DB, encryption, audit, storage
│   └── shared-frontend/     # npm: "@platform/ui" — React components, hooks, utils
├── apps/
│   ├── mybookkeeper/        # Personal bookkeeping + AI invoice extraction
│   └── (future apps)
├── .github/workflows/       # Per-app deploy workflows
└── package.json             # npm workspaces root
```

## Conventions

- Each app is independently deployable with its own Docker Compose, database, and CI/CD workflow
- Shared packages are installed locally (Python: `pip install -e`, npm: workspaces)
- Each app has its own CLAUDE.md with app-specific instructions
- Changes to `packages/` trigger deploys for all consuming apps

## Commands

**Shared backend package** (from `packages/shared-backend/`):
```bash
pip install -e .       # Install in dev mode
pytest                 # Run shared package tests
```

**Shared frontend package** (from `packages/shared-frontend/`):
```bash
npm install            # Install via workspaces (run from monorepo root)
```

**Per-app commands**: See each app's own CLAUDE.md.

## Workflow

- Branch naming: `feature/<name>`, `fix/<name>`
- PRs required before merging to main
- One feature per PR — never combine multiple features
