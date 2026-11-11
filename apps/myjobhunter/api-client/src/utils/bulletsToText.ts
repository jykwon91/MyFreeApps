/** A role's bullets as one line each, for a text box. */
export function bulletsToText(bullets: readonly string[]): string {
  return bullets.join("\n");
}
