"""Request-schema ``max_length`` must not exceed the column it feeds.

A ``str`` field with no ``max_length`` (or one larger than the target
``String(N)`` column) passes Pydantic validation, fails at the database, and
reaches the client as a 500 instead of a 422. This walks every request schema
listed below and fails CI when a field's bound is missing or looser than the
column's length.

``_SCHEMA_MODELS`` maps each request schema to the model whose columns it
writes (field names match column names). Add new request schemas here. The
completeness test fails if a ``*Request`` schema under ``app/schemas`` is in
neither ``_SCHEMA_MODELS`` nor ``_NO_LENGTH_LIMITED_COLUMNS``.
"""
from __future__ import annotations

import importlib
import inspect
import pkgutil
from typing import Any, Literal, get_args, get_origin

import pytest
from pydantic import BaseModel
from sqlalchemy import String

import app.schemas as schemas_pkg
from app.models.application.application import Application
from app.models.application.application_contact import ApplicationContact
from app.models.application.application_event import ApplicationEvent
from app.models.application.document import Document
from app.models.company.company import Company
from app.models.profile.education import Education
from app.models.profile.profile import Profile
from app.models.profile.screening_answer import ScreeningAnswer
from app.models.profile.skill import Skill
from app.models.profile.work_history import WorkHistory
from app.schemas.application.application_contact_create_request import ApplicationContactCreateRequest
from app.schemas.application.application_create_request import ApplicationCreateRequest
from app.schemas.application.application_event_create_request import ApplicationEventCreateRequest
from app.schemas.application.application_event_update_request import ApplicationEventUpdateRequest
from app.schemas.application.application_update_request import ApplicationUpdateRequest
from app.schemas.company.company_create_request import CompanyCreateRequest
from app.schemas.company.company_update_request import CompanyUpdateRequest
from app.schemas.documents.document_create_request import DocumentCreateRequest
from app.schemas.documents.document_file_create_internal import DocumentFileCreateInternal
from app.schemas.documents.document_text_create_request import DocumentTextCreateRequest
from app.schemas.documents.document_update_request import DocumentUpdateRequest
from app.schemas.profile.education_create_request import EducationCreateRequest
from app.schemas.profile.education_update_request import EducationUpdateRequest
from app.schemas.profile.profile_update_request import ProfileUpdateRequest
from app.schemas.profile.screening_answer_create_request import ScreeningAnswerCreateRequest
from app.schemas.profile.screening_answer_update_request import ScreeningAnswerUpdateRequest
from app.schemas.profile.skill_create_request import SkillCreateRequest
from app.schemas.profile.work_history_create_request import WorkHistoryCreateRequest
from app.schemas.profile.work_history_update_request import WorkHistoryUpdateRequest

_SCHEMA_MODELS: dict[type[BaseModel], type[Any]] = {
    ApplicationContactCreateRequest: ApplicationContact,
    ApplicationCreateRequest: Application,
    ApplicationEventCreateRequest: ApplicationEvent,
    ApplicationEventUpdateRequest: ApplicationEvent,
    ApplicationUpdateRequest: Application,
    CompanyCreateRequest: Company,
    CompanyUpdateRequest: Company,
    DocumentCreateRequest: Document,
    DocumentFileCreateInternal: Document,
    DocumentTextCreateRequest: Document,
    DocumentUpdateRequest: Document,
    EducationCreateRequest: Education,
    EducationUpdateRequest: Education,
    ProfileUpdateRequest: Profile,
    ScreeningAnswerCreateRequest: ScreeningAnswer,
    ScreeningAnswerUpdateRequest: ScreeningAnswer,
    SkillCreateRequest: Skill,
    WorkHistoryCreateRequest: WorkHistory,
    WorkHistoryUpdateRequest: WorkHistory,
}

# ``*Request`` schemas that write no length-limited String(N) column.
_NO_LENGTH_LIMITED_COLUMNS: frozenset[str] = frozenset({
    "ApplicationTransitionRequest",
    "CompanyResearchRequest",
    "DemoCreateRequest",
    "DiscoveredJobDismissRequest",
    "InterviewDetailsRequest",
    "InviteCreateRequest",
    "JdParseRequest",
    "JdUrlExtractRequest",
    "JobAnalysisRequest",
    "NavigateRequest",
    "SessionCompleteRequest",
    "SessionStartRequest",
    "TargetFromLineRequest",
    "TurnAcceptRequest",
    "TurnAlternativeRequest",
    "TurnCustomRequest",
    "TurnSkipRequest",
})

# Fields restricted to a fixed allowlist by a validator (enum / frozenset
# membership), or typed ``EmailStr`` (RFC cap of 254 < the 320 column), which
# bounds them below the column length by construction. ``Literal`` fields are
# checked against the column length directly, not listed here.
_ALLOWLIST_VALIDATED: frozenset[tuple[str, str]] = frozenset({
    ("ApplicationContactCreateRequest", "email"),
    ("ApplicationContactCreateRequest", "role"),
    ("ApplicationCreateRequest", "source"),
    ("ApplicationCreateRequest", "posted_salary_period"),
    ("ApplicationCreateRequest", "remote_type"),
    ("ApplicationUpdateRequest", "source"),
    ("ApplicationUpdateRequest", "posted_salary_period"),
    ("ApplicationUpdateRequest", "remote_type"),
    ("ProfileUpdateRequest", "work_auth_status"),
    ("ProfileUpdateRequest", "salary_period"),
    ("ProfileUpdateRequest", "remote_preference"),
    ("ProfileUpdateRequest", "seniority"),
    ("SkillCreateRequest", "category"),
})


def _column_lengths(model: type[Any]) -> dict[str, int]:
    return {
        col.name: col.type.length
        for col in model.__table__.columns
        if isinstance(col.type, String) and col.type.length is not None
    }


def _max_length(schema: type[BaseModel], field: str) -> int | None:
    for item in schema.model_fields[field].metadata:
        limit = getattr(item, "max_length", None)
        if limit is not None:
            return int(limit)
    return None


def _literal_values(schema: type[BaseModel], field: str) -> list[str] | None:
    """Return the string values of a ``Literal`` field, or None if it is not one."""
    stack = [schema.model_fields[field].annotation]
    while stack:
        annotation = stack.pop()
        if get_origin(annotation) is Literal:
            return [str(value) for value in get_args(annotation)]
        stack.extend(get_args(annotation))
    return None


def _cases() -> list[tuple[type[BaseModel], str, int]]:
    cases: list[tuple[type[BaseModel], str, int]] = []
    for schema, model in _SCHEMA_MODELS.items():
        lengths = _column_lengths(model)
        for field in schema.model_fields:
            if field in lengths:
                cases.append((schema, field, lengths[field]))
    return cases


@pytest.mark.parametrize(
    ("schema", "field", "column_length"),
    _cases(),
    ids=lambda v: v.__name__ if inspect.isclass(v) else str(v),
)
def test_schema_max_length_fits_column(
    schema: type[BaseModel], field: str, column_length: int,
) -> None:
    if (schema.__name__, field) in _ALLOWLIST_VALIDATED:
        return
    literal_values = _literal_values(schema, field)
    if literal_values is not None:
        too_long = [v for v in literal_values if len(v) > column_length]
        assert not too_long, (
            f"{schema.__name__}.{field} allows {too_long}, longer than the "
            f"String({column_length}) column"
        )
        return
    limit = _max_length(schema, field)
    assert limit is not None, (
        f"{schema.__name__}.{field} maps to a String({column_length}) column "
        "but has no max_length: an over-long value would 500 at the database"
    )
    assert limit <= column_length, (
        f"{schema.__name__}.{field} max_length={limit} exceeds the "
        f"String({column_length}) column"
    )


def test_every_request_schema_is_covered() -> None:
    mapped = {schema.__name__ for schema in _SCHEMA_MODELS}
    found: set[str] = set()
    for info in pkgutil.walk_packages(schemas_pkg.__path__, "app.schemas."):
        module = importlib.import_module(info.name)
        for name, cls in inspect.getmembers(module, inspect.isclass):
            if (
                issubclass(cls, BaseModel)
                and cls.__module__ == info.name
                and name.endswith("Request")
            ):
                found.add(name)
    uncovered = found - mapped - _NO_LENGTH_LIMITED_COLUMNS
    assert not uncovered, (
        f"Request schemas not in the column-length conformance map: {sorted(uncovered)}. "
        "Add each to _SCHEMA_MODELS (or _NO_LENGTH_LIMITED_COLUMNS if it writes "
        "no String(N) column)."
    )
