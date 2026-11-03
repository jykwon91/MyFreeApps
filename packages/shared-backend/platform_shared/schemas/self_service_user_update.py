"""Base for the body of ``PATCH /users/me`` and ``PATCH /users/{id}``."""
from fastapi_users.schemas import CreateUpdateDictModel
from pydantic import ConfigDict


class SelfServiceUserUpdate(CreateUpdateDictModel):
    """Lets an app's ``UserUpdate`` name only the profile fields it allows.

    fastapi-users' ``BaseUserUpdate`` also accepts ``email`` and ``password``, so a
    stolen token could change the email and take the account through password reset.
    It accepts ``is_superuser`` on ``PATCH /users/{id}`` too, which would skip the
    strict-superuser gate on the admin routes.

    Unknown fields are refused rather than ignored, so a client trying to change
    one of those gets an error instead of a success that changed nothing.
    """

    model_config = ConfigDict(extra="forbid")
