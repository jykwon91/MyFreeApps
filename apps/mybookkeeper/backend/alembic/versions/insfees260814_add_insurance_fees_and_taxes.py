"""Separate an insurance policy's fees and taxes from its premium.

``premium_cents`` was carrying whichever number the operator (or the document
reader) put in it, and on a surplus-lines policy those are two figures ~15%
apart: the 2026 Peerless renewal states a premium of $2,591.00 and a total
policy premium of $2,985.17, the difference being a policy fee, an inspection
fee, an agent fee, Texas surplus lines tax at 4.85% and the stamping fee at
0.04%.

Which one belongs in the column depends on the question. The overpaying
comparison measures against a TDI county average, which is a premium — so a
total stored there reads as 15% over market when it is not. The books want the
total, because that is what leaves the account. Storing one number could only
ever answer one of those, and answered the other wrongly without saying so.

So the premium column keeps the premium and the rest gets its own column. No
backfill is possible or attempted: for an existing row we cannot know which
number was typed, and inventing a split would manufacture a precision the data
never had. Existing rows keep their premium as-is and report no fees, which is
also the correct reading of an admitted-carrier policy that genuinely has none.

Revision ID: insfees260814
Revises: insprop260813
Create Date: 2026-08-14
"""
from alembic import op
import sqlalchemy as sa

revision = "insfees260814"
down_revision = "insprop260813"
branch_labels = None
depends_on = None


# Charged once for the policy term, not per billing period — the state does not
# levy surplus lines tax twelve times on a monthly pay plan — so the column is
# deliberately not paired with ``premium_frequency`` the way the premium is.
_AMOUNTS_CHECK = "chk_insurance_policy_amounts_valid"


def upgrade() -> None:
    op.add_column(
        "insurance_policies",
        sa.Column("fees_and_taxes_cents", sa.BigInteger(), nullable=True),
    )

    # Rewritten rather than added alongside, so there is one constraint naming
    # every amount rule instead of two that have to be read together.
    op.drop_constraint(_AMOUNTS_CHECK, "insurance_policies", type_="check")
    op.create_check_constraint(
        _AMOUNTS_CHECK,
        "insurance_policies",
        "(premium_cents IS NULL OR premium_cents > 0)"
        " AND (deductible_cents IS NULL OR deductible_cents >= 0)"
        # Zero is a real answer here and not a failed read: an admitted carrier
        # commonly charges no fees at all, which differs from "not recorded".
        " AND (fees_and_taxes_cents IS NULL OR fees_and_taxes_cents >= 0)",
    )


def downgrade() -> None:
    """Lossy by nature — the fees recorded against each policy are discarded.

    There is nowhere to put them back: folding them into ``premium_cents``
    would corrupt the premium, which is the column the comparison reads.
    """
    op.drop_constraint(_AMOUNTS_CHECK, "insurance_policies", type_="check")
    op.create_check_constraint(
        _AMOUNTS_CHECK,
        "insurance_policies",
        "(premium_cents IS NULL OR premium_cents > 0)"
        " AND (deductible_cents IS NULL OR deductible_cents >= 0)",
    )
    op.drop_column("insurance_policies", "fees_and_taxes_cents")
