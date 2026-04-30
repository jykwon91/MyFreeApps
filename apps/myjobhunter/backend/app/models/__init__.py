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

from app.models.integration.job_board_credential import JobBoardCredential  # noqa: F401

from app.models.jobs.resume_upload_job import ResumeUploadJob  # noqa: F401

from app.models.system.extraction_log import ExtractionLog  # noqa: F401
from app.models.system.auth_event import AuthEvent  # noqa: F401
