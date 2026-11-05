class MediaPublicBaseUrlUnresolvableError(RuntimeError):
    """Raised at startup when MINIO_PUBLIC_BASE_URL is set but its host does not resolve.

    Guards against the 2026-07-10 incident: MINIO_PUBLIC_BASE_URL was set to a
    custom domain (mga-clips.myfreeapps.org) that was never bound as an R2 custom
    domain — the myfreeapps.org zone is on Porkbun, not Cloudflare, so binding is
    impossible without a zone migration. The host was NXDOMAIN, so EVERY lineup
    clip/screenshot URL 404'd in the browser while the API and /health stayed
    green. Fail loud at boot instead of silently serving a library of dead media.
    """
