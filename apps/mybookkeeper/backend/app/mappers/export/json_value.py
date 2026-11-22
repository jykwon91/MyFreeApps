"""The JSON value type the account data export produces."""

JsonValue = str | int | float | bool | None | list["JsonValue"] | dict[str, "JsonValue"]
