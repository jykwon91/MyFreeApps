"""A webhook that can't be proven to come from Plaid. Answered 401; Plaid
retries real webhooks, so refusing one we can't verify loses nothing."""


class PlaidWebhookVerificationError(Exception):
    pass
