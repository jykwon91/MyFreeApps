from pydantic import BaseModel


class InviteAcceptResponse(BaseModel):
    organization_id: str
    org_role: str
