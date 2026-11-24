"""Tell a host lookup that failed only for now from one that can't succeed."""
import socket


def is_temporary_dns_failure(exc: BaseException) -> bool:
    """Whether a host lookup failed only for now ("Temporary failure in name
    resolution", ``EAI_AGAIN``): the resolver couldn't be reached or didn't
    answer in time, or the name server answered SERVFAIL. A retry may resolve
    the host, unlike a host that doesn't exist. A SERVFAIL that lasts, such as
    a domain with a broken DNSSEC signature, keeps failing this way."""
    return isinstance(exc, socket.gaierror) and exc.errno == socket.EAI_AGAIN
