OWNS_SHARED_WORKSPACE_MESSAGE = (
    "Other people use a workspace you created, and deleting your account would delete it "
    "for them too. Remove them from it, then try again."
)
HOLDS_SHARED_RECORDS_MESSAGE = (
    "You added records to a workspace that belongs to someone else, and deleting your account "
    "would take them out of that workspace's books. Contact us to have them moved, then try again."
)

# Rows that are about the user rather than part of a workspace's books. They can
# go with the account without anyone else losing a record.
TABLES_NOT_HOLDING_SHARED_RECORDS = frozenset({
    "calendar_email_review_queue",
    "email_filter_logs",
    "email_queue",
    "extraction_prompts",
    "gmail_skipped_messages",
    "integrations",
    "organization_invites",
    "organization_members",
    "processed_emails",
    "refresh_sessions",
    "reply_templates",
    "rent_receipt_sequences",
    "sync_logs",
    "usage_logs",
})
