"""All string enum values for CheckConstraint columns.

These are the canonical allowlists used in both model CheckConstraints
and application-level validation. Keep these in sync with alembic migration.
"""


class WorkAuthStatus:
    CITIZEN = "citizen"
    PERMANENT_RESIDENT = "permanent_resident"
    H1B = "h1b"
    TN = "tn"
    OPT = "opt"
    OTHER = "other"
    UNKNOWN = "unknown"

    ALL = ("citizen", "permanent_resident", "h1b", "tn", "opt", "other", "unknown")


class SalaryPeriod:
    ANNUAL = "annual"
    HOURLY = "hourly"
    MONTHLY = "monthly"

    ALL = ("annual", "hourly", "monthly")


class RemotePreference:
    REMOTE_ONLY = "remote_only"
    HYBRID = "hybrid"
    ONSITE = "onsite"
    ANY = "any"

    ALL = ("remote_only", "hybrid", "onsite", "any")


class Seniority:
    JUNIOR = "junior"
    MID = "mid"
    SENIOR = "senior"
    STAFF = "staff"
    PRINCIPAL = "principal"
    MANAGER = "manager"
    DIRECTOR = "director"
    EXEC = "exec"

    ALL = ("junior", "mid", "senior", "staff", "principal", "manager", "director", "exec")


class SkillCategory:
    LANGUAGE = "language"
    FRAMEWORK = "framework"
    TOOL = "tool"
    PLATFORM = "platform"
    SOFT = "soft"

    ALL = ("language", "framework", "tool", "platform", "soft")


class CompanySizeRange:
    MICRO = "1-10"
    SMALL = "11-50"
    MEDIUM = "51-200"
    LARGE = "201-1000"
    XLARGE = "1001-5000"
    ENTERPRISE = "5000+"

    ALL = ("1-10", "11-50", "51-200", "201-1000", "1001-5000", "5000+")


class OverallSentiment:
    POSITIVE = "positive"
    MIXED = "mixed"
    NEGATIVE = "negative"
    UNKNOWN = "unknown"

    ALL = ("positive", "mixed", "negative", "unknown")


class CompConfidence:
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"

    ALL = ("high", "medium", "low", "unknown")


class ResearchSourceType:
    GLASSDOOR = "glassdoor"
    TEAMBLIND = "teamblind"
    REDDIT = "reddit"
    LEVELS = "levels"
    PAYSCALE = "payscale"
    NEWS = "news"
    OFFICIAL = "official"
    OTHER = "other"

    ALL = ("glassdoor", "teamblind", "reddit", "levels", "payscale", "news", "official", "other")


class ApplicationSource:
    INDEED = "indeed"
    LINKEDIN = "linkedin"
    ZIPRECRUITER = "ziprecruiter"
    GREENHOUSE = "greenhouse"
    LEVER = "lever"
    WORKDAY = "workday"
    DIRECT = "direct"
    REFERRAL = "referral"
    CHROME_EXTENSION = "chrome_extension"
    OTHER = "other"

    ALL = ("indeed", "linkedin", "ziprecruiter", "greenhouse", "lever", "workday", "direct", "referral", "chrome_extension", "other")


class RemoteType:
    REMOTE = "remote"
    HYBRID = "hybrid"
    ONSITE = "onsite"
    UNKNOWN = "unknown"

    ALL = ("remote", "hybrid", "onsite", "unknown")


class EventType:
    APPLIED = "applied"
    EMAIL_RECEIVED = "email_received"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEW_COMPLETED = "interview_completed"
    REJECTED = "rejected"
    OFFER_RECEIVED = "offer_received"
    WITHDRAWN = "withdrawn"
    GHOSTED = "ghosted"
    NOTE_ADDED = "note_added"
    FOLLOW_UP_SENT = "follow_up_sent"

    ALL = (
        "applied",
        "email_received",
        "interview_scheduled",
        "interview_completed",
        "rejected",
        "offer_received",
        "withdrawn",
        "ghosted",
        "note_added",
        "follow_up_sent",
    )


class KanbanColumn:
    """Coarse-grained pipeline stages used by the kanban dashboard.

    The kanban surface collapses the fine-grained ``EventType`` allowlist
    into four buckets so the operator sees applications grouped by the
    decision they need to make next, not by the last log entry.

    Mapping (event_type -> kanban_column):
    - applied -> "applied"
    - interview_scheduled, interview_completed -> "interviewing"
    - offer_received -> "offer"
    - rejected, withdrawn, ghosted -> "closed"
    - None (no event) -> "applied" (legacy data)
    - note_added, email_received, follow_up_sent -> ignored (don't define a stage)
    """

    APPLIED = "applied"
    INTERVIEWING = "interviewing"
    OFFER = "offer"
    CLOSED = "closed"

    ALL = ("applied", "interviewing", "offer", "closed")


# Allowed transitions for drag-drop on the kanban board. Keyed by current
# column, value is the set of target columns the operator can reach via
# a drag. We deliberately allow every transition except no-op moves and
# moves that don't make sense (e.g., closed back to applied without an
# explicit "reopen" affordance). This is intentionally permissive — the
# operator owns the workflow; the kanban shouldn't enforce a rigid funnel.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    KanbanColumn.APPLIED: frozenset({KanbanColumn.INTERVIEWING, KanbanColumn.OFFER, KanbanColumn.CLOSED}),
    KanbanColumn.INTERVIEWING: frozenset({KanbanColumn.APPLIED, KanbanColumn.OFFER, KanbanColumn.CLOSED}),
    KanbanColumn.OFFER: frozenset({KanbanColumn.APPLIED, KanbanColumn.INTERVIEWING, KanbanColumn.CLOSED}),
    KanbanColumn.CLOSED: frozenset({KanbanColumn.APPLIED, KanbanColumn.INTERVIEWING, KanbanColumn.OFFER}),
}


class EventSource:
    MANUAL = "manual"
    GMAIL = "gmail"
    CALENDAR = "calendar"
    EXTENSION = "extension"
    SYSTEM = "system"

    ALL = ("manual", "gmail", "calendar", "extension", "system")


class ContactRole:
    RECRUITER = "recruiter"
    HIRING_MANAGER = "hiring_manager"
    INTERVIEWER = "interviewer"
    REFERRER = "referrer"
    OTHER = "other"

    ALL = ("recruiter", "hiring_manager", "interviewer", "referrer", "other")


class DocumentKind:
    """Canonical document kinds used in the ``documents`` table.

    These must stay in sync with:
    - The ``chk_document_kind`` CheckConstraint in the ORM model.
    - The Alembic migration that creates/alters the ``documents`` table.
    """

    COVER_LETTER = "cover_letter"
    TAILORED_RESUME = "tailored_resume"
    JOB_DESCRIPTION = "job_description"
    PORTFOLIO = "portfolio"
    OTHER = "other"

    ALL = ("cover_letter", "tailored_resume", "job_description", "portfolio", "other")


class GeneratedBy:
    USER = "user"
    CLAUDE = "claude"
    SYSTEM = "system"

    ALL = ("user", "claude", "system")


class JobBoard:
    LINKEDIN = "linkedin"
    INDEED = "indeed"
    ZIPRECRUITER = "ziprecruiter"
    GREENHOUSE = "greenhouse"
    LEVER = "lever"
    WORKDAY = "workday"
    OTHER = "other"

    ALL = ("linkedin", "indeed", "ziprecruiter", "greenhouse", "lever", "workday", "other")


class JobStatus:
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"
    CANCELLED = "cancelled"

    ALL = ("queued", "processing", "complete", "failed", "cancelled")


class ExtractionContextType:
    RESUME_PARSE = "resume_parse"
    JD_PARSE = "jd_parse"
    COMPANY_RESEARCH = "company_research"
    COVER_LETTER = "cover_letter"
    RESUME_TAILOR = "resume_tailor"
    EMAIL_CLASSIFY = "email_classify"
    OTHER = "other"

    ALL = ("resume_parse", "jd_parse", "company_research", "cover_letter", "resume_tailor", "email_classify", "other")


class ExtractionStatus:
    SUCCESS = "success"
    ERROR = "error"
    PARTIAL = "partial"

    ALL = ("success", "error", "partial")
