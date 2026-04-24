# Security Policy

## Supported Versions

Only the latest commit on `main` receives security updates. There are no tagged releases or long-term support branches.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

To report a vulnerability, use one of the following:

1. **GitHub Private Vulnerability Reporting** — preferred. Visit the repository's Security tab and click "Report a vulnerability".
2. **Email** — `jasonykwon91@gmail.com` with subject line `[SECURITY] <short description>`.

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce.
- Any relevant logs, screenshots, or proof-of-concept code.
- Your disclosure timeline expectations.

You should receive an acknowledgement within 72 hours. We aim to issue a fix within 14 days for critical issues and 30 days for lower-severity issues.

## Scope

The following are in scope for security reports:

- Authentication / authorization bypass
- Cross-site scripting (XSS), cross-site request forgery (CSRF)
- SQL injection, command injection
- Server-side request forgery (SSRF)
- Data exposure across user/tenant boundaries
- Dependency vulnerabilities with a working exploit path
- Secrets exposure in git history or public artifacts

The following are out of scope:

- Denial-of-service attacks via brute force
- Vulnerabilities in third-party services (report to the service owner)
- Issues that require physical access or a compromised device
- Social engineering

## Hardening

This repository applies the following controls:

- Secret scanning and push protection (GitHub-native).
- CodeQL static analysis on every push and pull request.
- Dependency review and Dependabot alerts for Python, npm, and GitHub Actions.
- `gitleaks` pre-commit hook and CI scan.
- Branch protection on `main`: pull request required, status checks required, signed commits required.
- All runtime secrets held in GitHub Actions Secrets or the deployment environment; nothing sensitive in source.
- Password hashing via Argon2id with 12-character minimum length and HIBP range-API compromised-password checks.
- Optional TOTP-based two-factor authentication for user accounts.
- Encryption at rest for OAuth tokens (Fernet-derived keys).
- Per-user row-level data isolation enforced at the repository layer.

## Credits

We recognize responsible disclosure. With your permission, we'll credit you in the release notes for any fix derived from your report.
