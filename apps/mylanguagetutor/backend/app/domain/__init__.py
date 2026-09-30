"""Pure-Python domain registries for MyLanguageTutor.

Languages, learner levels, and conversation scenarios are code, not DB rows:
they change only with a deploy, and the ``tutor_session`` CHECK constraints are
derived from the same tuples (see ``app/core/tutor_enums.py``). Nothing here
imports SQLAlchemy or FastAPI.
"""
