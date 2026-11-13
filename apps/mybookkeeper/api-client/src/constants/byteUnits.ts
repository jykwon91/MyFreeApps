/**
 * A decimal megabyte, the unit Caddy means by ``MB``: it parses sizes with go-humanize, where
 * ``30MB`` is 30,000,000 bytes and only ``30MiB`` is 30 × 1024 × 1024.
 */
export const MB = 1000 * 1000;

/** A binary mebibyte, the unit the backend's own limits use (``core/config.py`` writes them as ``n * 1024 * 1024``). */
export const MIB = 1024 * 1024;
