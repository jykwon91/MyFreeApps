# MyFreeApps

Monorepo of small web apps sharing a common backend and frontend platform.

## Apps

- **MyJobHunter** — job application tracker with AI-powered JD parsing, company research, and Gmail-driven status updates.
- **MyBookkeeper** — personal bookkeeping + AI invoice extraction. Rental property focus; extracts structured financial data from PDFs, images, and Gmail.

## Structure

```
MyFreeApps/
├── packages/
│   ├── shared-backend/      # Python: "platform_shared" — auth, DB, encryption, audit, storage, TOTP
│   ├── shared-core/         # npm: "@platform/core" — platform-neutral API client, auth, Redux store base
│   └── shared-frontend/     # npm: "@platform/ui" — React components, hooks, browser wiring for shared-core
├── apps/
│   ├── myjobhunter/         # Job application tracker
│   └── mybookkeeper/        # Personal bookkeeping + AI invoice extraction
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
