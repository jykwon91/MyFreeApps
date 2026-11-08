/** Where each wanted column is in a generated file's column list; a missing column throws, naming the file. */
export function columnIndexes<const T extends readonly string[]>(
  file: string,
  names: readonly string[],
  wanted: T,
): Record<T[number], number> {
  const out = {} as Record<T[number], number>;
  for (const w of wanted as readonly T[number][]) {
    const i = names.indexOf(w);
    if (i < 0) throw new Error(`${file}: missing column ${w}`);
    out[w] = i;
  }
  return out;
}
