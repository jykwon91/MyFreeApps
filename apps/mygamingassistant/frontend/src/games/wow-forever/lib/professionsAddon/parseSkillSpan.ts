const SKILL_SPAN = /^(\d+)\s*[–-]\s*(\d+)$/;
const SKILL_POINT = /^\d+$/;

/** A guide row's skill column: "1–10" is a span, "75" a single skill (a milestone), so `from` = `to`. */
export function parseSkillSpan(text: string): { from: number; to: number } {
  const trimmed = text.trim();
  const span = SKILL_SPAN.exec(trimmed);
  if (span) return { from: Number(span[1]), to: Number(span[2]) };
  if (SKILL_POINT.test(trimmed)) return { from: Number(trimmed), to: Number(trimmed) };
  throw new Error(`Professions addon: can't read the skill "${text}"`);
}
