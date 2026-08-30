/**
 * Where the API lives from the browser's point of view.
 *
 * The backend's routers are mounted at the resource name (`/discovery`,
 * `/recipes`) — the `/api` prefix is added by the reverse proxy and stripped
 * before FastAPI sees it (see apps/myrecipes/CLAUDE.md → Routing). Axios adds
 * it via `baseURL`, so anything that reaches the network WITHOUT axios — an
 * `<img src>`, an `<a href>` to a backend path — has to add it here.
 */
export const API_BASE_PATH = "/api";

/** Absolute-from-root browser path for an API-relative path. */
export function apiUrl(path: string): string {
  return `${API_BASE_PATH}${path}`;
}
