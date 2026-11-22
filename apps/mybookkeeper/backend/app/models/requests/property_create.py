from typing import Optional

from pydantic import BaseModel, model_validator

from app.models.properties.property import PropertyType, reconcile_type
from app.models.properties.property_classification import PropertyClassification
from app.models.requests.property_money_field import PropertyMoney


class PropertyCreate(BaseModel):
    name: str
    address: str
    classification: PropertyClassification = PropertyClassification.UNCLASSIFIED
    type: Optional[PropertyType] = None
    purchase_price: Optional[PropertyMoney] = None

    @model_validator(mode="after")
    def validate_classification_type(self) -> "PropertyCreate":
        self.type = reconcile_type(self.classification, self.type)
        return self
