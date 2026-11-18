import api from "@platform/core/lib/api";
import type { AxiosAdapter } from "axios";

export interface PagedListingsServer {
  /** The `offset` of every list read, in order. */
  offsets: number[];
  /** A list read starting at or after this offset fails with a server error. */
  failFromOffset: number | null;
}

/** GET /listings answering a page at a time, from `count` listings titled "Room 0", "Room 1" and so on. */
export function startPagedListingsServer(count: number): PagedListingsServer {
  const server: PagedListingsServer = { offsets: [], failFromOffset: null };
  const rows = Array.from({ length: count }, (_, index) => ({ id: `li${index}`, title: `Room ${index}` }));
  const adapter: AxiosAdapter = (config) => {
    const { offset = 0, limit = rows.length } = (config.params ?? {}) as { offset?: number; limit?: number };
    const respond = (data: unknown, status = 200) => {
      const response = { data, status, statusText: "", headers: {}, config };
      if (status < 400) return Promise.resolve(response);
      return Promise.reject(Object.assign(new Error(String(status)), { config, response, isAxiosError: true }));
    };
    if (config.url !== "/listings") return respond({});
    server.offsets.push(offset);
    if (server.failFromOffset !== null && offset >= server.failFromOffset) return respond({ detail: "nope" }, 500);
    const items = rows.slice(offset, offset + limit);
    return respond({ items, total: rows.length, has_more: offset + items.length < rows.length });
  };
  api.defaults.adapter = adapter;
  return server;
}
