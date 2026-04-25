from typing import Optional

from pydantic import BaseModel, model_validator

from app.models.properties.property import PropertyType
from app.models.properties.property_classification import PropertyClassification


class PropertyCreate(BaseModel):
    name: str
    address: str
    classification: PropertyClassification = PropertyClassification.UNCLASSIFIED
    type: Optional[PropertyType] = None

    @model_validator(mode="after")
    def validate_classification_type(self) -> "PropertyCreate":
        if self.classification == PropertyClassification.INVESTMENT and self.type is None:
            self.type = PropertyType.SHORT_TERM
        if self.classification in (PropertyClassification.PRIMARY_RESIDENCE, PropertyClassification.SECOND_HOME):
            self.type = None
        return self
