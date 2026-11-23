const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Whether focus is in a field the user can type in, which nothing should pull focus away from. */
export function isTypingFocused(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.isConnected) return false;
  if (active.isContentEditable) return true;
  return TYPING_TAGS.has(active.tagName) && !active.matches(":disabled");
}
