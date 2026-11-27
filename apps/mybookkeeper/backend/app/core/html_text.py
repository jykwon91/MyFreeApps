"""Put plain text, such as a message someone else wrote, into an HTML email."""
import html


def text_to_html(text: str) -> str:
    """``text`` escaped for HTML (quotes included), with its line breaks kept as ``<br>``."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n")
    return html.escape(lines).replace("\n", "<br>")
