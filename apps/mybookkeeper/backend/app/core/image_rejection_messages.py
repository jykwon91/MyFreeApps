"""``ImageRejected`` reasons for an image Pillow can't read.

Routes send a reason as the reply's ``detail``, so it never carries Pillow's
own message (which can name temp paths or object addresses); that is logged.
"""
from typing import Final

IMAGE_UNDECODABLE_REASON: Final = "cannot decode image"
IMAGE_PROCESSING_FAILED_REASON: Final = "image processing failed"
