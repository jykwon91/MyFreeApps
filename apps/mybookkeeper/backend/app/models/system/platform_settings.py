from decimal import Decimal

from sqlalchemy import Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlatformSettings(Base):
    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    cost_input_rate_per_million: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=Decimal("3.0"))
    cost_output_rate_per_million: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=Decimal("15.0"))
    cost_daily_budget: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("50.0"))
    cost_monthly_budget: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("1000.0"))
    cost_per_user_daily_alert: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("10.0"))
