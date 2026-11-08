/** A tool input that passed its schema, or why it didn't. */
export type AskInputCheck<T> = { ok: true; value: T } | { ok: false; error: string };
