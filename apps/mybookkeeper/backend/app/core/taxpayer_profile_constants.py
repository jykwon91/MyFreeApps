"""Fixed copy for taxpayer-profile writes."""
from typing import Final

# A lone surrogate (``"\ud800"``) is valid JSON but can't be encoded, so it
# can't be encrypted. The codec's own error names the character and its
# position; the reply carries this instead.
UNENCODABLE_FIELD_MESSAGE_TEMPLATE: Final = "{field} contains characters that can't be saved"
