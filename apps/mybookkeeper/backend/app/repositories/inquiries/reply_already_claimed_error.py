"""Raised by ``inquiry_reply_send_repo.claim`` when the claim already exists."""
from __future__ import annotations


class ReplyAlreadyClaimedError(Exception):
    """A claim for this (inquiry, client request id) already exists."""
