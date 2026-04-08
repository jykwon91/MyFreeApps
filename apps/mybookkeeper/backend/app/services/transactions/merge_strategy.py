from app.models.transactions.transaction import Transaction

MERGEABLE_FIELDS = [
    "transaction_date",
    "vendor",
    "description",
    "amount",
    "category",
    "property_id",
    "tags",
    "payment_method",
    "channel",
]


def auto_pick_defaults(txn_a: Transaction, txn_b: Transaction) -> dict[str, str]:
    """Return {"field_name": "a"|"b"|"both"} for each mergeable field.

    Rules:
      transaction_date — prefer earlier date
      vendor           — prefer non-null, then longer string
      description      — prefer non-null, then longer string
      amount           — prefer from txn with non-null extraction_id; fallback to "a"
      category         — prefer non-"uncategorized"
      property_id      — prefer non-null
      tags             — always "both" (union handled by caller)
      payment_method   — prefer non-null
      channel          — prefer non-null
    """
    picks: dict[str, str] = {}

    # transaction_date: prefer earlier
    if txn_a.transaction_date <= txn_b.transaction_date:
        picks["transaction_date"] = "a"
    else:
        picks["transaction_date"] = "b"

    # vendor: prefer non-null, then longer
    if txn_a.vendor is None and txn_b.vendor is not None:
        picks["vendor"] = "b"
    elif txn_b.vendor is None and txn_a.vendor is not None:
        picks["vendor"] = "a"
    elif txn_a.vendor is not None and txn_b.vendor is not None:
        picks["vendor"] = "a" if len(txn_a.vendor) >= len(txn_b.vendor) else "b"
    else:
        picks["vendor"] = "a"

    # description: prefer non-null, then longer
    if txn_a.description is None and txn_b.description is not None:
        picks["description"] = "b"
    elif txn_b.description is None and txn_a.description is not None:
        picks["description"] = "a"
    elif txn_a.description is not None and txn_b.description is not None:
        picks["description"] = "a" if len(txn_a.description) >= len(txn_b.description) else "b"
    else:
        picks["description"] = "a"

    # amount: prefer from txn with non-null extraction_id (AI-sourced = higher quality)
    if txn_a.extraction_id is not None and txn_b.extraction_id is None:
        picks["amount"] = "a"
    elif txn_b.extraction_id is not None and txn_a.extraction_id is None:
        picks["amount"] = "b"
    else:
        picks["amount"] = "a"

    # category: prefer non-"uncategorized"
    if txn_a.category == "uncategorized" and txn_b.category != "uncategorized":
        picks["category"] = "b"
    else:
        picks["category"] = "a"

    # property_id: prefer non-null
    if txn_a.property_id is None and txn_b.property_id is not None:
        picks["property_id"] = "b"
    else:
        picks["property_id"] = "a"

    # tags: always union (caller is responsible for merging)
    picks["tags"] = "both"

    # payment_method: prefer non-null
    if txn_a.payment_method is None and txn_b.payment_method is not None:
        picks["payment_method"] = "b"
    else:
        picks["payment_method"] = "a"

    # channel: prefer non-null
    if txn_a.channel is None and txn_b.channel is not None:
        picks["channel"] = "b"
    else:
        picks["channel"] = "a"

    return picks
