"""What POST /companies/{id}/research says when Tavily isn't configured.

``TavilyNotConfiguredError`` names the env var to set, which is for the
operator: the route logs it and sends this fixed copy instead.
"""
from typing import Final

TAVILY_NOT_CONFIGURED_DETAIL: Final = "Company research isn't available right now."
