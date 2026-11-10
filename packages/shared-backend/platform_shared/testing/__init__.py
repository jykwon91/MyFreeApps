"""Shared test utilities for platform_shared consuming apps.

Modules
-------
- ``factories``: canonical pytest user fixtures, so each app's ``conftest.py``
  imports them instead of re-implementing them::

      from platform_shared.testing.factories import make_user_fixture, make_api_user_factory

- ``model_loading``: ``load_all_models`` imports every model file so
  ``Base.metadata`` is complete.
- ``account_deletion_schema`` / ``account_deletion_assertions``: pure schema
  checks and the one-call assertions that keep account deletion from leaving
  user data behind. Works on code metadata or a reflected migrated database.
- ``sqlite_metadata``: makes PostgreSQL-only column types work in SQLite tests.

See each module's docstring for full usage examples.
"""
