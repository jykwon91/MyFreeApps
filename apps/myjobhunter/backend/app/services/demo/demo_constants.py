"""Realistic seed data for MyJobHunter demo accounts.

The point of this module is to make a demo account look like a real
job-hunting professional in flight: a profile with several years of
work history, a handful of skills, a couple degrees, plus 4-5
applications across the typical pipeline stages (applied / interview /
offer / rejected) tied to plausible fake companies.

When showing the app to a stranger, the operator wants Dashboard,
Applications, Companies, and Profile to render with content that
demonstrates the value of every screen. This module is the source of
that content.

Design rules mirrored from MBK's ``demo_constants.py``:

  - Plain Python data structures (lists of dicts / tuples). No coupling
    to ORM models — the repository converts them into rows.
  - Plausible-but-fake company names (Acme Corp, Globex, Initech, etc.).
  - Real-sounding job titles and bullet points.
  - Dates anchored to the current calendar year minus a few months so
    the timeline looks active when the demo is shown.

The seed sets are intentionally small (3 companies, 4 applications) so
a freshly-created demo account loads quickly on every screen and the
operator can show the full pipeline without scrolling.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import TypedDict

DEMO_EMAIL_DOMAIN = "myjobhunter.local"
DEMO_EMAIL_PREFIX = "demo"
DEMO_DEFAULT_DISPLAY_NAME = "Alex Demo"


def generate_demo_password() -> str:
    """Return a strong random password suitable for a demo account.

    Uses ``secrets.token_urlsafe(16)`` which yields a 22-character
    URL-safe base64 string. Comfortably exceeds the 12-char minimum
    enforced by ``UserManager.validate_password`` and HIBP is bypassed
    in the demo path because the password is freshly random.
    """
    return secrets.token_urlsafe(16)


def make_demo_email() -> str:
    """Generate a unique demo email under ``myjobhunter.local``.

    ``.local`` is RFC 6762 reserved (mDNS) so it will never collide
    with a real deliverable inbox. The UUID slice keeps the email
    short enough to display comfortably in the credentials modal but
    long enough to avoid collisions across many demo accounts.
    """
    slug = uuid.uuid4().hex[:12]
    return f"{DEMO_EMAIL_PREFIX}+{slug}@{DEMO_EMAIL_DOMAIN}"


# ---------------------------------------------------------------------------
# Profile seed
# ---------------------------------------------------------------------------


class ProfileSeed(TypedDict):
    """Top-level profile fields (the ``profiles`` row).

    Everything here maps directly to columns on
    ``app.models.profile.profile.Profile``. Validated against the
    table's CheckConstraints in unit tests.
    """

    summary: str
    work_auth_status: str
    desired_salary_min: float
    desired_salary_max: float
    salary_currency: str
    salary_period: str
    locations: list[str]
    remote_preference: str
    seniority: str
    timezone: str


DEMO_PROFILE: ProfileSeed = {
    "summary": (
        "Senior software engineer with 8+ years building scalable web "
        "applications. Strong background in backend systems, distributed "
        "infrastructure, and developer tooling. Looking for a senior or "
        "staff IC role at a product-led company."
    ),
    "work_auth_status": "citizen",
    "desired_salary_min": 180000.0,
    "desired_salary_max": 230000.0,
    "salary_currency": "USD",
    "salary_period": "annual",
    "locations": ["San Francisco, CA", "Remote (US)"],
    "remote_preference": "hybrid",
    "seniority": "senior",
    "timezone": "America/Los_Angeles",
}


# ---------------------------------------------------------------------------
# Work history seed (newest first)
# ---------------------------------------------------------------------------


class WorkHistorySeed(TypedDict):
    company_name: str
    title: str
    start_date: date
    end_date: date | None
    bullets: list[str]


DEMO_WORK_HISTORY: list[WorkHistorySeed] = [
    {
        "company_name": "Hooli",
        "title": "Senior Software Engineer",
        "start_date": date(2023, 3, 1),
        "end_date": None,
        "bullets": [
            "Led migration of monolithic billing service to event-driven microservices, cutting p99 latency by 40%.",
            "Mentored 3 junior engineers; designed onboarding curriculum now used team-wide.",
            "Drove adoption of feature-flag-based deploys, reducing rollback frequency by 60%.",
        ],
    },
    {
        "company_name": "Pied Piper",
        "title": "Software Engineer II",
        "start_date": date(2020, 6, 1),
        "end_date": date(2023, 2, 28),
        "bullets": [
            "Built real-time data ingestion pipeline handling 50M events/day with Kafka + Flink.",
            "Owned the GraphQL gateway, reducing average payload size by 35% via persisted queries.",
            "Shipped end-to-end customer dashboard used by 80% of paying customers within 6 months.",
        ],
    },
    {
        "company_name": "Initech",
        "title": "Software Engineer",
        "start_date": date(2018, 8, 1),
        "end_date": date(2020, 5, 31),
        "bullets": [
            "Wrote and maintained the core Rails monolith that powered the product's first $5M ARR.",
            "Improved test suite runtime from 25 minutes to 6 minutes via parallelization and DB seeding.",
            "Implemented company-wide SSO (Okta + SAML), eliminating ~40 weekly password-reset tickets.",
        ],
    },
]


# ---------------------------------------------------------------------------
# Education seed
# ---------------------------------------------------------------------------


class EducationSeed(TypedDict):
    school: str
    degree: str
    field: str
    start_year: int
    end_year: int
    gpa: float | None


DEMO_EDUCATION: list[EducationSeed] = [
    {
        "school": "University of California, Berkeley",
        "degree": "B.S.",
        "field": "Computer Science",
        "start_year": 2014,
        "end_year": 2018,
        "gpa": 3.7,
    },
]


# ---------------------------------------------------------------------------
# Skills seed
# ---------------------------------------------------------------------------


class SkillSeed(TypedDict):
    name: str
    years_experience: int
    category: str


DEMO_SKILLS: list[SkillSeed] = [
    {"name": "Python", "years_experience": 8, "category": "language"},
    {"name": "TypeScript", "years_experience": 6, "category": "language"},
    {"name": "Go", "years_experience": 3, "category": "language"},
    {"name": "React", "years_experience": 6, "category": "framework"},
    {"name": "FastAPI", "years_experience": 4, "category": "framework"},
    {"name": "PostgreSQL", "years_experience": 7, "category": "platform"},
    {"name": "Kubernetes", "years_experience": 4, "category": "platform"},
    {"name": "AWS", "years_experience": 5, "category": "platform"},
]


# ---------------------------------------------------------------------------
# Companies seed (parent table for applications)
# ---------------------------------------------------------------------------


class CompanySeed(TypedDict):
    name: str
    primary_domain: str
    industry: str
    size_range: str
    hq_location: str
    description: str


DEMO_COMPANIES: list[CompanySeed] = [
    {
        "name": "Acme Corp",
        "primary_domain": "acme.example",
        "industry": "Logistics",
        "size_range": "1001-5000",
        "hq_location": "Chicago, IL",
        "description": (
            "Acme Corp builds modern logistics infrastructure for "
            "small and mid-sized businesses. Fast-growing Series C "
            "with strong engineering culture."
        ),
    },
    {
        "name": "Globex",
        "primary_domain": "globex.example",
        "industry": "Cybersecurity",
        "size_range": "201-1000",
        "hq_location": "Austin, TX",
        "description": (
            "Globex is a cybersecurity platform protecting "
            "developer-first companies from supply-chain attacks. "
            "Series B, ~400 employees."
        ),
    },
    {
        "name": "Stark Industries",
        "primary_domain": "stark.example",
        "industry": "Hardware / IoT",
        "size_range": "5000+",
        "hq_location": "New York, NY",
        "description": (
            "Stark Industries designs and manufactures consumer "
            "smart-home hardware. Public company with a strong "
            "software engineering org."
        ),
    },
]


# ---------------------------------------------------------------------------
# Applications seed
# ---------------------------------------------------------------------------


class ApplicationSeed(TypedDict):
    """One application row plus a small list of events.

    ``company_index`` indexes into ``DEMO_COMPANIES`` so the repository
    can resolve the FK after the parent companies are inserted.

    ``events`` is a list of (event_type, days_after_applied) tuples.
    The repository converts ``days_after_applied`` to an absolute
    timestamp anchored on ``applied_at``.
    """

    company_index: int
    role_title: str
    location: str
    remote_type: str
    source: str
    posted_salary_min: float
    posted_salary_max: float
    fit_score: float
    notes: str
    days_ago_applied: int
    events: list[tuple[str, int]]


DEMO_APPLICATIONS: list[ApplicationSeed] = [
    {
        "company_index": 0,  # Acme Corp
        "role_title": "Senior Backend Engineer",
        "location": "Chicago, IL",
        "remote_type": "hybrid",
        "source": "linkedin",
        "posted_salary_min": 175000.0,
        "posted_salary_max": 220000.0,
        "fit_score": 88.0,
        "notes": "Recruiter Meghan reached out — fast process, hiring manager available next week.",
        "days_ago_applied": 21,
        "events": [
            ("applied", 0),
            ("interview_scheduled", 5),
            ("interview_completed", 8),
            ("offer_received", 14),
        ],
    },
    {
        "company_index": 1,  # Globex
        "role_title": "Staff Software Engineer, Platform",
        "location": "Remote (US)",
        "remote_type": "remote",
        "source": "referral",
        "posted_salary_min": 220000.0,
        "posted_salary_max": 280000.0,
        "fit_score": 75.0,
        "notes": "Referred by old Pied Piper coworker. Strong team, big scope.",
        "days_ago_applied": 12,
        "events": [
            ("applied", 0),
            ("interview_scheduled", 4),
            ("interview_completed", 7),
        ],
    },
    {
        "company_index": 2,  # Stark Industries
        "role_title": "Senior Software Engineer, Devices",
        "location": "New York, NY",
        "remote_type": "onsite",
        "source": "indeed",
        "posted_salary_min": 190000.0,
        "posted_salary_max": 240000.0,
        "fit_score": 60.0,
        "notes": "Onsite-only — would need to relocate. Pass unless offer is exceptional.",
        "days_ago_applied": 30,
        "events": [
            ("applied", 0),
            ("rejected", 10),
        ],
    },
    {
        "company_index": 0,  # Acme Corp again — different role
        "role_title": "Principal Engineer, Logistics",
        "location": "Chicago, IL",
        "remote_type": "hybrid",
        "source": "direct",
        "posted_salary_min": 240000.0,
        "posted_salary_max": 300000.0,
        "fit_score": 72.0,
        "notes": "Stretch role — would be a level up. Keep in pipeline only if first Acme offer falls through.",
        "days_ago_applied": 5,
        "events": [
            ("applied", 0),
        ],
    },
]


# ---------------------------------------------------------------------------
# Resume upload job seed (status=complete with parsed_fields)
# ---------------------------------------------------------------------------


def make_resume_parsed_fields() -> dict[str, object]:
    """Return a realistic ``parsed_fields`` JSONB body for a complete job.

    Mirrors the shape of what the real resume parser worker produces
    so the Profile page renders end-to-end without mocking.
    """
    return {
        "name": DEMO_DEFAULT_DISPLAY_NAME,
        "email": "alex.demo@example.com",
        "phone": "+1 415 555 0142",
        "location": "San Francisco, CA",
        "summary": DEMO_PROFILE["summary"],
        "skills": [s["name"] for s in DEMO_SKILLS],
        "work_history": [
            {
                "company": w["company_name"],
                "title": w["title"],
                "start": w["start_date"].isoformat(),
                "end": w["end_date"].isoformat() if w["end_date"] else None,
                "bullets": w["bullets"],
            }
            for w in DEMO_WORK_HISTORY
        ],
        "education": [
            {
                "school": e["school"],
                "degree": e["degree"],
                "field": e["field"],
                "start_year": e["start_year"],
                "end_year": e["end_year"],
                "gpa": e["gpa"],
            }
            for e in DEMO_EDUCATION
        ],
    }


# Filename + content type are display-only metadata for the UI. The
# resume_upload_jobs row carries no actual MinIO object — the
# ``file_path`` value is a synthetic key marker so the Phase-2
# upload-history surface can still render a row.
DEMO_RESUME_FILENAME = "alex_demo_resume.pdf"
DEMO_RESUME_CONTENT_TYPE = "application/pdf"
DEMO_RESUME_OBJECT_KEY_PREFIX = "demo/resume"


def make_resume_object_key() -> str:
    """Return a synthetic MinIO key for a demo resume upload.

    Demo accounts intentionally do NOT write to MinIO — the bucket may
    not be configured in dev, and seeding real bytes adds zero
    showcase value (the operator is demoing the parsed fields, not the
    file blob). The key format is preserved so the Profile screen's
    upload list renders.
    """
    return f"{DEMO_RESUME_OBJECT_KEY_PREFIX}/{uuid.uuid4().hex}/{DEMO_RESUME_FILENAME}"


def days_ago(n: int) -> datetime:
    """UTC timestamp ``n`` days before now. Used for ``applied_at`` etc."""
    return datetime.now(timezone.utc) - timedelta(days=n)
