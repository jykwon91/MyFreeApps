from pydantic import BaseModel, EmailStr


class SmtpStatus(BaseModel):
    configured: bool
    from_email: str
    from_name: str
    recipients: list[str]


class SmtpTestRequest(BaseModel):
    email: EmailStr


class SmtpTestResponse(BaseModel):
    success: bool
    message: str
