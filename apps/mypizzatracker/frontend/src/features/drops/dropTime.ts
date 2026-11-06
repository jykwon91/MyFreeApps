export function ensureSeconds(t: string): string {
  // <input type="time"> emits "HH:MM"; backend wants "HH:MM:SS".
  return t.length === 5 ? `${t}:00` : t;
}

export function formatTime(t: string): string {
  // "HH:MM:SS" -> "HH:MM"
  return t.length >= 5 ? t.slice(0, 5) : t;
}
