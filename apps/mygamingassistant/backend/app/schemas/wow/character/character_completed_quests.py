"""The quests a character has turned in, as Blizzard's ``/quests/completed`` tells it."""
from pydantic import BaseModel


class CharacterCompletedQuests(BaseModel):
    quest_ids: list[int]
