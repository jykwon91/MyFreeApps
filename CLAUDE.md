# CLAUDE.md

## Project

**MyFreeApps** — a monorepo containing shared infrastructure packages and multiple SaaS web applications.

## Structure

```
MyFreeApps/
├── packages/
│   ├── shared-backend/      # Python: "platform_shared" — auth, DB, encryption, audit, storage
│   ├── shared-core/         # npm: "@platform/core" — logic shared by web and mobile
│   ├── shared-frontend/     # npm: "@platform/ui" — React components, hooks, utils
│   └── shared-mobile/       # npm: "@platform/mobile" — React Native theme + components
├── apps/
│   ├── mybookkeeper/        # Personal bookkeeping + AI invoice extraction
│   └── (future apps)
├── infra/templates/
│   ├── scaffold/            # new_app's template (web + backend)
│   └── scaffold-mobile/     # new_mobile's template (Expo). An npm workspace, so its
│                            # dependencies are locked before any app uses them
├── sites/
│   └── landing/public/      # myfreeapps.org — static page linking every deployed app
│                            # (served by host Caddy; deploy-landing.yml; keep in sync
│                            # with infra/Caddyfile — test_landing_page.py enforces it)
│                            # public/jason/ = portfolio page; its screenshots come from
│                            # sites/landing/capture/ (see its README — never from prod)
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

**Shared mobile package** (from `packages/shared-mobile/`; needs Node 22):
```bash
npm run typecheck && npm run lint && npm test
```

**Add mobile to an existing app** (from `packages/shared-backend/`):
```bash
python -m platform_shared.infra.new_mobile <slug>     # apps/<slug>/mobile, mobile: true, CI workflow
python -m platform_shared.infra.screen_map --app <slug>
```
Then add a Dependabot entry for `/apps/<slug>/mobile`. `apps/<slug>/mobile/screen-map.yaml`
gives every web route a `screen:` or a `not_on_mobile:` reason, and CI fails on a web route
with no entry, a route it can't read, or a frontend with no routes (those last two for every
app, `mobile` or not). It catches added, renamed and removed pages, not edits to an existing page.

Mobile versions move only with an Expo SDK upgrade (`expo install --fix`), so CI's `expo-doctor`
skips its version check, which would otherwise fail on every Expo patch release. React and
react-native stay exact. Web Dockerfiles leave `packages/shared-mobile` out on purpose: that
keeps react-native out of their `npm ci`. Web code must not import `@platform/mobile`.

**Per-app commands**: See each app's own CLAUDE.md.

## Workflow

- Branch naming: `feature/<name>`, `fix/<name>`
- PRs required before merging to main
- One feature per PR — never combine multiple features
