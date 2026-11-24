from typing import Literal

# Where an SMTP send was when it failed:
#   "building"     — writing the message out as text, before connecting.
#   "opening"      — connecting, starting TLS and logging in. Nothing here
#                    depends on the message, so a failure is never its fault.
#   "handing_over" — giving the server the sender, the recipients and the message.
SmtpSendStage = Literal["building", "opening", "handing_over"]
