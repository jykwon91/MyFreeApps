# Import all models so that Alembic's env.py sees them when it imports this module.
# Order matters for forward references — declare referenced tables before referencing ones.

from app.models.user.user import User  # noqa: F401

from app.models.profile.profile import Profile  # noqa: F401
from app.models.profile.work_history import WorkHistory  # noqa: F401
from app.models.profile.education import Education  # noqa: F401
from app.models.profile.skill import Skill  # noqa: F401
from app.models.profile.screening_answer import ScreeningAnswer  # noqa: F401

from app.models.company.company import Company  # noqa: F401
from app.models.company.company_research import CompanyResearch  # noqa: F401
from app.models.company.research_source import ResearchSource  # noqa: F401

from app.models.application.application import Application  # noqa: F401
from app.models.application.application_event import ApplicationEvent  # noqa: F401
from app.models.application.application_contact import ApplicationContact  # noqa: F401
from app.models.application.document import Document  # noqa: F401

from app.models.job_analysis.job_analysis import JobAnalysis  # noqa: F401

from app.models.integration.job_board_credential import JobBoardCredential  # noqa: F401

from app.models.jobs.resume_upload_job import ResumeUploadJob  # noqa: F401

from app.models.resume_refinement.session import ResumeRefinementSession  # noqa: F401
from app.models.resume_refinement.turn import ResumeRefinementTurn  # noqa: F401

from app.models.system.extraction_log import ExtractionLog  # noqa: F401

from app.models.platform.invite import PlatformInvite  # noqa: F401

# Shared models from platform_shared. Importing them here registers their
# tables with ``Base.metadata`` so Alembic autogenerate + Base.metadata.create_all
# see the schema. The tables themselves are provisioned by alembic migration
# 0002 (PR C2). MJH does not own the schema — platform_shared is canonical.
from platform_shared.db.models.audit_log import AuditLog  # noqa: F401
from platform_shared.db.models.auth_event import AuthEvent  # noqa: F401
