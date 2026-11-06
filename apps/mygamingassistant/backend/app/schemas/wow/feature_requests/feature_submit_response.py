"""POST /wow/feature-requests response, discriminated on ``verdict``."""
from typing import Annotated, Union

from pydantic import Field

from app.schemas.wow.feature_requests.submit_clarification_response import SubmitClarificationResponse
from app.schemas.wow.feature_requests.submit_duplicate_response import SubmitDuplicateResponse
from app.schemas.wow.feature_requests.submit_new_response import SubmitNewResponse
from app.schemas.wow.feature_requests.submit_rejected_response import SubmitRejectedResponse

FeatureSubmitResponse = Annotated[
    Union[SubmitNewResponse, SubmitDuplicateResponse, SubmitClarificationResponse, SubmitRejectedResponse],
    Field(discriminator="verdict"),
]
