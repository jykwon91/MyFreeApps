def sql_in_list(values: tuple[str, ...]) -> str:
    """Render values as a SQL ``IN`` list, e.g. ``('a', 'b')``, for a CheckConstraint."""
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"
