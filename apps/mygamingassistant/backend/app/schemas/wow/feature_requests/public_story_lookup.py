"""The public detail response: the story, or where a merged story went."""
from typing import Union

from app.schemas.wow.feature_requests.merged_story_pointer import MergedStoryPointer
from app.schemas.wow.feature_requests.public_story import PublicStory

PublicStoryLookup = Union[PublicStory, MergedStoryPointer]
