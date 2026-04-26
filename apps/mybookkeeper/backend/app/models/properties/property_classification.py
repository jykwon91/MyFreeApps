import enum


class PropertyClassification(str, enum.Enum):
    INVESTMENT = "investment"
    PRIMARY_RESIDENCE = "primary_residence"
    SECOND_HOME = "second_home"
    UNCLASSIFIED = "unclassified"
