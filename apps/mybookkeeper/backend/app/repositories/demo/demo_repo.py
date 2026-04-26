import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documents.document import Document
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.organization.tax_profile import TaxProfile
from app.models.properties.property import Property, PropertyType
from app.models.properties.property_classification import PropertyClassification
from app.models.tax.tax_form_field import TaxFormField
from app.models.tax.tax_form_instance import TaxFormInstance
from app.models.tax.tax_return import TaxReturn
from app.models.transactions.transaction import Transaction
from app.models.transactions.transaction_document import TransactionDocument
from app.models.user.user import Role, User


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_org_by_user(db: AsyncSession, user_id: uuid.UUID) -> Organization | None:
    result = await db.execute(
        select(Organization).where(Organization.created_by == user_id)
    )
    return result.scalar_one_or_none()


async def get_org_by_id(db: AsyncSession, org_id: uuid.UUID) -> Organization | None:
    result = await db.execute(
        select(Organization).where(Organization.id == org_id)
    )
    return result.scalar_one_or_none()


async def is_demo_org(db: AsyncSession, org_id: uuid.UUID) -> bool:
    result = await db.execute(
        select(Organization.is_demo).where(Organization.id == org_id)
    )
    val = result.scalar_one_or_none()
    return bool(val)


async def find_document_by_content_hash(
    db: AsyncSession, organization_id: uuid.UUID, content_hash: str,
) -> Document | None:
    result = await db.execute(
        select(Document).where(
            Document.organization_id == organization_id,
            Document.content_hash == content_hash,
        )
    )
    return result.scalar_one_or_none()


async def count_demo_data(
    db: AsyncSession, organization_id: uuid.UUID,
) -> dict[str, int]:
    props = await db.execute(
        select(func.count()).select_from(Property).where(
            Property.organization_id == organization_id,
        )
    )
    txns = await db.execute(
        select(func.count()).select_from(Transaction).where(
            Transaction.organization_id == organization_id,
            Transaction.deleted_at.is_(None),
        )
    )
    docs = await db.execute(
        select(func.count()).select_from(Document).where(
            Document.organization_id == organization_id,
        )
    )
    returns = await db.execute(
        select(func.count()).select_from(TaxReturn).where(
            TaxReturn.organization_id == organization_id,
        )
    )
    return {
        "properties": props.scalar_one(),
        "transactions": txns.scalar_one(),
        "documents": docs.scalar_one(),
        "tax_returns": returns.scalar_one(),
    }


async def list_demo_users(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(Organization)
        .where(Organization.is_demo.is_(True))
        .order_by(Organization.created_at.desc())
    )
    orgs = result.scalars().all()
    users_data: list[dict] = []
    for org in orgs:
        user_result = await db.execute(select(User).where(User.id == org.created_by))
        user = user_result.scalar_one_or_none()
        if not user:
            continue
        upload_result = await db.execute(
            select(func.count()).select_from(Document).where(Document.organization_id == org.id)
        )
        upload_count = upload_result.scalar_one()
        users_data.append({
            'user_id': user.id, 'email': user.email,
            'tag': org.demo_tag or 'legacy',
            'organization_id': org.id, 'organization_name': org.name,
            'created_at': org.created_at, 'upload_count': upload_count,
        })
    return users_data


async def create_user(
    db: AsyncSession, email: str, hashed_password: str, name: str,
) -> User:
    user = User(
        email=email,
        hashed_password=hashed_password,
        name=name,
        role=Role.USER,
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user


async def create_org_with_member(
    db: AsyncSession,
    name: str,
    user_id: uuid.UUID,
    is_demo: bool = False,
    demo_tag: str | None = None,
) -> Organization:
    org = Organization(name=name, created_by=user_id, is_demo=is_demo, demo_tag=demo_tag)
    db.add(org)
    await db.flush()

    member = OrganizationMember(
        organization_id=org.id,
        user_id=user_id,
        org_role="owner",
    )
    db.add(member)
    await db.flush()
    return org


async def create_tax_profile(
    db: AsyncSession, organization_id: uuid.UUID,
) -> TaxProfile:
    profile = TaxProfile(
        organization_id=organization_id,
        tax_situations=["rental_property"],
        onboarding_completed=True,
    )
    db.add(profile)
    await db.flush()
    return profile


async def create_properties(
    db: AsyncSession,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    properties_data: list[dict],
) -> list[uuid.UUID]:
    property_ids: list[uuid.UUID] = []
    for prop_data in properties_data:
        prop = Property(
            organization_id=organization_id,
            user_id=user_id,
            name=prop_data["name"],
            address=prop_data["address"],
            classification=PropertyClassification.INVESTMENT,
            type=PropertyType(prop_data["type"]),
        )
        db.add(prop)
        await db.flush()
        property_ids.append(prop.id)
    return property_ids


async def create_transactions(
    db: AsyncSession,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_ids: list[uuid.UUID],
    transactions_data: list[tuple],
) -> list[Transaction]:
    """Create transactions and return them for document linking."""
    created: list[Transaction] = []
    for row in transactions_data:
        prop_idx, date_str, vendor, desc, amount, txn_type, category, sched_line, tags, sub_cat = row
        txn_date = date.fromisoformat(date_str)
        txn = Transaction(
            organization_id=organization_id,
            user_id=user_id,
            property_id=property_ids[prop_idx],
            transaction_date=txn_date,
            tax_year=txn_date.year,
            vendor=vendor,
            description=desc,
            amount=Decimal(amount),
            transaction_type=txn_type,
            category=category,
            sub_category=sub_cat,
            schedule_e_line=sched_line,
            tags=tags,
            tax_relevant=True,
            status="approved",
            is_manual=True,
        )
        db.add(txn)
        created.append(txn)
    await db.flush()
    return created


async def create_documents_with_links(
    db: AsyncSession,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_ids: list[uuid.UUID],
    properties_data: list[dict],
    transactions: list[Transaction],
    documents_data: list[dict],
    pdf_generator: object | None = None,
) -> list[Document]:
    """Create documents with PDF content and link them to matching transactions."""
    created_docs: list[Document] = []

    for doc_data in documents_data:
        prop_idx = doc_data["property_index"]
        prop_id = property_ids[prop_idx]
        match_spec = doc_data["match"]

        matched_txns = _match_transactions(transactions, property_ids, prop_idx, match_spec)

        # Generate PDF content if generator provided
        file_content: bytes | None = None
        if pdf_generator is not None:
            prop_name = properties_data[prop_idx]["name"]
            prop_address = properties_data[prop_idx]["address"]
            txn_dicts = [
                {
                    "vendor": txn.vendor,
                    "amount": str(txn.amount),
                    "date": txn.transaction_date.isoformat(),
                    "description": txn.description,
                    "property_name": prop_name,
                    "property_address": prop_address,
                    "sub_category": txn.sub_category,
                }
                for txn in matched_txns
            ]
            file_content = pdf_generator.generate(doc_data, txn_dicts)

        doc = Document(
            organization_id=organization_id,
            user_id=user_id,
            property_id=prop_id,
            file_name=doc_data["file_name"],
            file_type="pdf",
            file_mime_type="application/pdf",
            file_content=file_content,
            document_type=doc_data["document_type"],
            source="upload",
            status="completed",
        )
        db.add(doc)
        await db.flush()
        created_docs.append(doc)

        for txn in matched_txns:
            link = TransactionDocument(
                transaction_id=txn.id,
                document_id=doc.id,
                link_type="duplicate_source",
            )
            db.add(link)

    await db.flush()
    return created_docs


def _match_transactions(
    transactions: list[Transaction],
    property_ids: list[uuid.UUID],
    doc_prop_idx: int,
    match_spec: dict,
) -> list[Transaction]:
    """Find transactions that match a document's match specification."""
    matched: list[Transaction] = []
    target_prop_id = property_ids[doc_prop_idx]

    for txn in transactions:
        if txn.property_id != target_prop_id:
            continue

        # If match_spec has a specific property_index constraint, check it
        if "property_index" in match_spec:
            if txn.property_id != property_ids[match_spec["property_index"]]:
                continue

        if "vendor" in match_spec and txn.vendor != match_spec["vendor"]:
            continue

        if "date" in match_spec:
            if txn.transaction_date.isoformat() != match_spec["date"]:
                continue

        if "month" in match_spec:
            if txn.transaction_date.month != match_spec["month"]:
                continue

        if "category" in match_spec and txn.category != match_spec["category"]:
            continue

        matched.append(txn)

    return matched


async def create_tax_documents(
    db: AsyncSession,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    property_ids: list[uuid.UUID],
    tax_docs_data: list[dict],
    pdf_generator: object,
) -> list[Document]:
    """Create tax document records with generated PDF content."""
    created: list[Document] = []

    for doc_data in tax_docs_data:
        prop_idx = doc_data.get("property_index")
        prop_id = property_ids[prop_idx] if prop_idx is not None else None

        pdf_bytes = pdf_generator.generate(doc_data["pdf_data"])

        doc = Document(
            organization_id=organization_id,
            user_id=user_id,
            property_id=prop_id,
            file_name=doc_data["file_name"],
            file_type="pdf",
            file_mime_type="application/pdf",
            file_content=pdf_bytes,
            document_type=doc_data["document_type"],
            source="upload",
            status="completed",
        )
        db.add(doc)
        created.append(doc)

    await db.flush()
    return created


async def create_tax_return(
    db: AsyncSession, organization_id: uuid.UUID,
    tax_year: int = 2025, filing_status: str = "married_filing_jointly",
) -> TaxReturn:
    tax_return = TaxReturn(
        organization_id=organization_id,
        tax_year=tax_year,
        filing_status=filing_status,
        jurisdiction="federal",
        status="draft",
    )
    db.add(tax_return)
    await db.flush()
    return tax_return


async def create_tax_form_instances(
    db: AsyncSession,
    tax_return_id: uuid.UUID,
    tax_docs: list[Document],
    tax_docs_data: list[dict],
) -> list[TaxFormInstance]:
    """Create extracted TaxFormInstance + TaxFormField records for demo tax documents.

    This wires the Document records into the tax pipeline so they appear as
    "received" on the Tax Documents page. Only creates instances for recognized
    tax form types (1099_k, 1099_misc, 1098).
    """
    # Map document_type to (form_name, key_fields) for the 3 recognized tax docs
    _FORM_CONFIG: dict[str, dict] = {
        "1099_k": {
            "key_field": "gross_amount",
            "key_label": "Gross amount of payment card/third party network transactions",
            "amount_key": "gross_amount",
            "issuer_key": "issuer_name",
            "ein_key": "issuer_tin",
        },
        "1099_misc": {
            "key_field": "box_1",
            "key_label": "Rents",
            "amount_key": "rents_amount",
            "issuer_key": "issuer_name",
            "ein_key": "issuer_tin",
        },
        "1098": {
            "key_field": "mortgage_interest_received",
            "key_label": "Mortgage interest received from payer(s)/borrower(s)",
            "amount_key": "mortgage_interest",
            "issuer_key": "lender_name",
            "ein_key": "lender_tin",
        },
        "w2": {
            "key_field": "wages_tips_other",
            "key_label": "Wages, tips, other compensation",
            "amount_key": "wages",
            "issuer_key": "employer_name",
            "ein_key": "employer_ein",
        },
    }

    created: list[TaxFormInstance] = []

    for doc, doc_data in zip(tax_docs, tax_docs_data):
        form_name = doc_data["document_type"]
        config = _FORM_CONFIG.get(form_name)
        if not config:
            continue

        pdf_data = doc_data["pdf_data"]
        issuer_name = pdf_data.get(config["issuer_key"])
        issuer_ein = pdf_data.get(config["ein_key"])

        instance = TaxFormInstance(
            tax_return_id=tax_return_id,
            form_name=form_name,
            source_type="extracted",
            document_id=doc.id,
            property_id=doc.property_id,
            issuer_name=issuer_name,
            issuer_ein=issuer_ein,
            status="validated",
        )
        db.add(instance)
        await db.flush()

        # Parse amount string (e.g., "35,500.00") to Decimal
        amount_str = pdf_data.get(config["amount_key"], "0")
        amount = Decimal(amount_str.replace(",", ""))

        field = TaxFormField(
            form_instance_id=instance.id,
            field_id=config["key_field"],
            field_label=config["key_label"],
            value_numeric=amount,
            is_calculated=False,
            confidence="high",
        )
        db.add(field)
        created.append(instance)

    await db.flush()
    return created


async def delete_all_demo_data(
    db: AsyncSession, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> None:
    # TransactionDocument links are cleaned up by CASCADE on both FKs
    await db.execute(
        delete(Transaction).where(Transaction.organization_id == organization_id)
    )
    await db.execute(
        delete(Document).where(Document.organization_id == organization_id)
    )
    await db.execute(
        delete(TaxReturn).where(TaxReturn.organization_id == organization_id)
    )
    await db.execute(
        delete(Property).where(Property.organization_id == organization_id)
    )


async def delete_demo_user_completely(
    db: AsyncSession, user_id: uuid.UUID, organization_id: uuid.UUID,
) -> None:
    await delete_all_demo_data(db, user_id, organization_id)
    await db.execute(
        delete(TaxProfile).where(TaxProfile.organization_id == organization_id)
    )
    await db.execute(
        delete(OrganizationMember).where(
            OrganizationMember.organization_id == organization_id
        )
    )
    await db.execute(
        delete(Organization).where(Organization.id == organization_id)
    )
    await db.execute(delete(User).where(User.id == user_id))
