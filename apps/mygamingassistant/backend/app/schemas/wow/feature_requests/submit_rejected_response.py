"""Submit verdict ``rejected``: off-topic, abusive or not about this site.

The frontend shows one neutral message; the reason stays private.
"""
from typing import Literal

from pydantic import BaseModel


class SubmitRejectedResponse(BaseModel):
    verdict: Literal["rejected"] = "rejected"
