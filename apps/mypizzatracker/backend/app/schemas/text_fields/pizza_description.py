"""A pizza's free-form description (an unbounded Text column), trimmed at the ends."""
from typing import Annotated

from pydantic import StringConstraints

PizzaDescription = Annotated[str, StringConstraints(strip_whitespace=True)]
