"""The bearer token a request was sent with."""
from fastapi import HTTPException, Request, status
from fastapi.security.utils import get_authorization_scheme_param


async def bearer_token(request: Request) -> str:
    """For a route that already authenticated the request and needs the token itself."""
    scheme, token = get_authorization_scheme_param(request.headers.get("Authorization"))
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return token


__all__ = ["bearer_token"]
