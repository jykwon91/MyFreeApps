"""Raised when "Research now" is asked of someone who hasn't turned research on."""


class ResearchDisabledError(Exception):
    pass
