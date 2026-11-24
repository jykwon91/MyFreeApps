"""Registry: table name -> the mapper that exports one of its rows."""
from typing import Final

from app.mappers.export.account_export_mappers import ACCOUNT_EXPORT_MAPPERS
from app.mappers.export.applicant_export_mappers import APPLICANT_EXPORT_MAPPERS
from app.mappers.export.financial_account_export_mappers import (
    FINANCIAL_ACCOUNT_EXPORT_MAPPERS,
)
from app.mappers.export.inquiry_export_mappers import INQUIRY_EXPORT_MAPPERS
from app.mappers.export.insurance_export_mappers import INSURANCE_EXPORT_MAPPERS
from app.mappers.export.lease_export_mappers import LEASE_EXPORT_MAPPERS
from app.mappers.export.listing_export_mappers import LISTING_EXPORT_MAPPERS
from app.mappers.export.property_export_mappers import PROPERTY_EXPORT_MAPPERS
from app.mappers.export.rent_export_mappers import RENT_EXPORT_MAPPERS
from app.mappers.export.table_export_mapper import TableExportMapper
from app.mappers.export.tax_export_mappers import TAX_EXPORT_MAPPERS
from app.mappers.export.spending_category_export_mappers import (
    SPENDING_CATEGORY_EXPORT_MAPPERS,
)
from app.mappers.export.transaction_export_mappers import TRANSACTION_EXPORT_MAPPERS
from app.mappers.export.welcome_manual_export_mappers import (
    WELCOME_MANUAL_EXPORT_MAPPERS,
)

EXPORT_MAPPERS: Final[dict[str, TableExportMapper]] = {
    mapper.table_name: mapper
    for mapper in (
        *ACCOUNT_EXPORT_MAPPERS,
        *PROPERTY_EXPORT_MAPPERS,
        *LISTING_EXPORT_MAPPERS,
        *INQUIRY_EXPORT_MAPPERS,
        *APPLICANT_EXPORT_MAPPERS,
        *LEASE_EXPORT_MAPPERS,
        *RENT_EXPORT_MAPPERS,
        *TRANSACTION_EXPORT_MAPPERS,
        *FINANCIAL_ACCOUNT_EXPORT_MAPPERS,
        *SPENDING_CATEGORY_EXPORT_MAPPERS,
        *TAX_EXPORT_MAPPERS,
        *INSURANCE_EXPORT_MAPPERS,
        *WELCOME_MANUAL_EXPORT_MAPPERS,
    )
}
