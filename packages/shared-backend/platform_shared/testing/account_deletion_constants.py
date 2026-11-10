"""Defaults for the account-deletion schema guards."""

# A column looks like a stored-file reference when its name is exactly one of
# these words or ends with "_" + the word (``cover_image``, ``file_path``).
# Mid-word endings such as ``postimage`` do not match.
STORED_FILE_COLUMN_SUFFIXES: tuple[str, ...] = (
    "path", "paths",
    "key", "keys",
    "url", "urls",
    "uri",
    "file", "files", "filename",
    "object",
    "bucket",
    "avatar",
    "image", "images",
    "photo", "photos",
    "attachment", "attachments",
    "thumbnail", "thumbnails",
    "audio",
    "screenshot", "screenshots",
    "document", "documents",
)
