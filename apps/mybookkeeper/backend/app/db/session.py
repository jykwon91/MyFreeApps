from platform_shared.db.session import create_session_factory

from app.core.config import settings

_factory = create_session_factory(settings.database_url)

engine = _factory.engine
AsyncSessionLocal = _factory.session_maker
get_db = _factory.get_db
unit_of_work = _factory.unit_of_work
