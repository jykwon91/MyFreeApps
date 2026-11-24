"""What GET /users/me/export leaves out, and why.

``EXPORT_EXCLUDED_TABLES`` lists every table holding user or workspace data
that is deliberately NOT exported, each with the reason. ``EXPORT_EXCLUDED_COLUMNS``
records, for every exported table, each column the export leaves out and why.
``tests/test_account_export_completeness.py`` fails when a user- or
workspace-scoped table is neither exported nor excluded here, and when a
column of an exported table is neither in its mapper's output nor excluded
here, so new data cannot silently miss the export (or leak into it).
"""
from typing import Final

EXPORT_USER_SECTION: Final = "user"

_SYNC_BOOKKEEPING = (
    "Internal email-sync bookkeeping (what was fetched, skipped or filtered); "
    "the documents and transactions it produced are exported."
)

EXPORT_EXCLUDED_TABLES: Final[dict[str, str]] = {
    "refresh_sessions": "Login-session credentials (secret hashes); a secret with no value to the user.",
    "auth_events": "Security audit trail written by the platform, not user content.",
    "audit_logs": "Security audit trail written by the platform, not user content.",
    "organization_invites": (
        "Pending invitation tokens addressed to other people; membership administration, "
        "not the user's data. The user's own membership is exported."
    ),
    "email_queue": (
        "Transient work queue holding raw email attachments while they are processed; "
        "the resulting documents are exported."
    ),
    "email_filter_logs": _SYNC_BOOKKEEPING,
    "gmail_skipped_messages": _SYNC_BOOKKEEPING,
    "processed_emails": _SYNC_BOOKKEEPING,
    "sync_logs": _SYNC_BOOKKEEPING,
    "extractions": (
        "Internal AI processing records (raw model responses, token counts); what they "
        "extracted is exported as documents, transactions and tax forms."
    ),
    "usage_logs": "AI usage metering for cost control; internal, not user content.",
    "system_events": "Internal operational events and alerts; not user content.",
    "rent_receipt_sequences": "Internal counter that numbers rent receipts; not user content.",
}

_KEY_VERSION = "Encryption key bookkeeping; the encrypted values themselves are exported decrypted."
_STORAGE_KEY = (
    "Internal object-storage path. The export lists each file's details, never raw bucket "
    "paths, the same as for documents."
)

EXPORT_EXCLUDED_COLUMNS: Final[dict[str, dict[str, str]]] = {
    "users": {
        "hashed_password": "Credential hash; a secret.",
        "totp_secret": "Encrypted 2FA secret; a credential.",
        "totp_recovery_codes": "Encrypted 2FA recovery codes; credentials.",
        "totp_algorithm": "2FA verification internals.",
        "totp_last_used_step": "2FA replay-protection internals.",
        "auth_valid_after": "Session-invalidation watermark; security internals.",
        "failed_login_count": "Login lockout counter; security internals.",
        "last_failed_login_at": "Login lockout state; security internals.",
        "locked_until": "Login lockout state; security internals.",
    },
    "organizations": {},
    "organization_members": {},
    "tax_profiles": {},
    "taxpayer_profiles": {
        "encrypted_ssn": (
            "Full SSN. The app only reveals it behind an explicit reveal step; the export "
            "carries ssn_last_four. The other encrypted fields are exported decrypted."
        ),
    },
    "activities": {},
    "classification_rules": {},
    "integrations": {
        "access_token_encrypted": "Ciphertext of the OAuth access token; a secret.",
        "refresh_token_encrypted": "Ciphertext of the OAuth refresh token; a secret.",
        "key_version": "Encryption key bookkeeping for the OAuth token ciphertext.",
        "token_expiry": "Expiry of the OAuth access token; token-refresh internals.",
        "gmail_address": (
            "The connected mailbox address, recorded to tie each sent email to a mailbox; "
            "the app never shows it (the integrations page lists only what "
            "to_integration_info returns)."
        ),
        "pii_key_version": _KEY_VERSION,
    },
    "extraction_prompts": {},
    "properties": {},
    "property_activity_periods": {},
    "tenants": {},
    "leases": {},
    "utility_account_link": {},
    "utility_plans": {},
    "market_rate_benchmarks": {},
    "listings": {},
    "listing_photos": {"storage_key": _STORAGE_KEY},
    "listing_external_ids": {},
    "listing_blackouts": {},
    "listing_blackout_attachments": {"storage_key": _STORAGE_KEY},
    "channel_listings": {
        "ical_import_url": (
            "The channel's secret-bearing calendar feed URL: anyone holding it can read the "
            "booking calendar. A credential, not data."
        ),
        "ical_import_secret_token": "Secret token for the channel's calendar feed; a credential.",
        "ical_export_token": (
            "Bearer secret of this listing's public calendar feed: anyone holding it can read "
            "the calendar. A credential, not data."
        ),
    },
    "calendar_email_review_queue": {},
    "calendar_listing_blocklist": {},
    "inquiries": {
        "client_ip": "Inquirer's network address, kept only for spam detection; anti-abuse internals.",
        "user_agent": "Inquirer's browser string, kept only for spam detection; anti-abuse internals.",
        "key_version": _KEY_VERSION,
    },
    "inquiry_events": {},
    "inquiry_messages": {"key_version": _KEY_VERSION},
    "inquiry_reply_sends": {
        "client_request_id": "Idempotency key that stops a reply being sent twice; internal.",
        "request_hash": "Idempotency fingerprint of the send request; internal.",
        "claimed_at": "Send-in-progress lock timestamp; internal.",
        "key_version": _KEY_VERSION,
    },
    "inquiry_spam_assessments": {},
    "reply_templates": {},
    "applicants": {
        "id_document_storage_key": _STORAGE_KEY,
        "key_version": _KEY_VERSION,
    },
    "applicant_events": {},
    "applicant_references": {"key_version": _KEY_VERSION},
    "screening_results": {"report_storage_key": _STORAGE_KEY},
    "video_call_notes": {
        "transcript_storage_key": _STORAGE_KEY,
        "key_version": _KEY_VERSION,
    },
    "vendors": {},
    "lease_templates": {},
    "lease_template_files": {"storage_key": _STORAGE_KEY},
    "lease_template_placeholders": {},
    "signed_leases": {},
    "signed_lease_attachments": {"storage_key": _STORAGE_KEY},
    "signed_lease_templates": {},
    "lease_term_versions": {},
    "pending_rent_receipts": {
        "send_claimed_at": "Send-in-progress lock timestamp; internal.",
        "key_version": _KEY_VERSION,
    },
    "rent_schedules": {},
    "rent_charges": {},
    "rent_reminder_plans": {},
    "rent_reminder_sends": {"key_version": _KEY_VERSION},
    "payer_alias": {},
    "rent_attribution_review_queue": {},
    "documents": {
        "file_content": "Raw file bytes; the export is JSON and lists each file's details.",
        "file_storage_key": _STORAGE_KEY,
        "content_hash": "Internal duplicate-detection hash.",
        "batch_content_hash": "Internal duplicate-detection hash.",
        "retry_count": "Processing retry bookkeeping; internal.",
        "next_retry_at": "Processing retry bookkeeping; internal.",
    },
    "transactions": {},
    "spending_categories": {},
    "transaction_documents": {},
    "booking_statements": {},
    "reconciliation_sources": {},
    "reconciliation_matches": {},
    "tax_returns": {},
    "tax_year_profiles": {},
    "tax_form_instances": {},
    "tax_form_fields": {},
    "tax_form_field_sources": {},
    "tax_carryforwards": {},
    "tax_advisor_generations": {
        "raw_response": "Raw AI model output; its content is exported as tax_advisor_suggestions.",
        "input_tokens": "AI usage metering; internal.",
        "output_tokens": "AI usage metering; internal.",
    },
    "tax_advisor_suggestions": {},
    "cost_basis_lots": {},
    "estimated_tax_payments": {},
    "insurance_policies": {"key_version": _KEY_VERSION},
    "insurance_policy_attachments": {"storage_key": _STORAGE_KEY},
    "insurance_benchmarks": {},
    "mortgages": {"key_version": _KEY_VERSION},
    "financial_accounts": {},
    "plaid_items": {
        "access_token_encrypted": "Ciphertext of the Plaid access token; a credential to the bank data.",
        "key_version": "Encryption key bookkeeping for the access token ciphertext.",
        "transactions_cursor": "Plaid's opaque sync position; sync internals, meaningless outside Plaid.",
    },
    "welcome_manuals": {
        "share_token": "Bearer secret of the guest share link; a credential.",
        "share_pin": "PIN that unlocks the guest share link; a credential.",
        "key_version": "Encryption key bookkeeping for the share PIN ciphertext.",
        "failed_unlock_count": "Share-link brute-force lockout counter; security internals.",
        "unlock_locked_until": "Share-link brute-force lockout state; security internals.",
    },
    "welcome_manual_rooms": {},
    "welcome_manual_sections": {},
    "welcome_manual_section_fields": {},
    "welcome_manual_section_images": {"storage_key": _STORAGE_KEY},
    "welcome_manual_places": {},
    "welcome_manual_sends": {"key_version": _KEY_VERSION},
}
