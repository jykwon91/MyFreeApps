import type { ListEnvelope } from "./types/list-envelope";

/** The most rows the server's paged list endpoints answer per request (`limit: Query(50, ge=1, le=100)`). */
export const SERVER_LIMIT_CAP = 100;

/**
 * Answers a paged list request the way the server does: the `limit` rows from `offset`. A limit above
 * the server's cap is refused, as the server refuses it with a 422.
 */
export function answerListPage<T>(rows: readonly T[], params: Readonly<Record<string, unknown>>): ListEnvelope<T> {
  const limit = Number(params.limit);
  const offset = Number(params.offset ?? 0);
  if (!(limit >= 1 && limit <= SERVER_LIMIT_CAP)) throw new Error(`limit ${String(params.limit)} refused`);
  return { items: rows.slice(offset, offset + limit), total: rows.length, has_more: offset + limit < rows.length };
}
