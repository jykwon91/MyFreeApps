import uuid

from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = "users"

    display_name: Mapped[str] = mapped_column(String(100), default="")
