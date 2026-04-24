# MyFreeApps

Monorepo of small web apps sharing a common backend and frontend platform.

## Apps

- **MyJobHunter** — job application tracker with AI-powered JD parsing, company research, and Gmail-driven status updates.
- **MyBookkeeper** (planned migration) — personal bookkeeping + AI invoice extraction. Currently lives as a separate private repo; will be imported here once shared packages stabilize.

## Structure

```
MyFreeApps/
├── packages/
│   ├── shared-backend/      # Python: "platform_shared" — auth, DB, encryption, audit, storage, TOTP
│   └── shared-frontend/     # npm: "@platform/ui" — React components, hooks, Redux store base
├── apps/
│   └── myjobhunter/         # Job application tracker
└── .github/
    ├── workflows/           # Per-app CI/CD and security workflows
    ├── dependabot.yml       # Dependency updates
    └── CODEOWNERS           # Review enforcement
```

## Status

This is a personal project. The repository is public for transparency and to enable future open-source contribution, but it is not currently accepting external pull requests.

## Security

If you discover a security vulnerability, please see [SECURITY.md](SECURITY.md) for responsible disclosure.

## License

[MIT](LICENSE).
