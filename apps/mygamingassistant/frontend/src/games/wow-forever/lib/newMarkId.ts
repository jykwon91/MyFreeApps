/** A fresh mark id: short lowercase letters and digits, unique enough within one browser's marks. */
export function newMarkId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
