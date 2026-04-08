"""Shared sync database session for CLI tools."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

engine = create_engine(settings.database_url_sync, echo=False)
SyncSession = sessionmaker(bind=engine)
