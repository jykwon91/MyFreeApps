from typing import Literal

# "smtp" sends through the configured SMTP server; "console" only logs the
# send, for development and CI. The boot guard refuses "console" elsewhere.
EmailBackend = Literal["smtp", "console"]
