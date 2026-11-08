"""The network a client IP belongs to, for per-network limits and hashes."""
import ipaddress


def network_of(ip: str, *, ipv6_prefix: int) -> str:
    """The IP itself (IPv4) or its IPv6 network (one home or phone); unparseable values as-is."""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if address.version == 6:
        return str(ipaddress.ip_network(f"{address}/{ipv6_prefix}", strict=False))
    return str(address)
