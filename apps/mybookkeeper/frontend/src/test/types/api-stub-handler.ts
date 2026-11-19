/**
 * Answers one request of a stubbed API: the response body, or a rejection for a server error. `params` holds
 * the request's params and its URL's query (one value per key); `query` is the URL's own query, repeated keys kept.
 */
export type ApiStubHandler = (path: string, params: Readonly<Record<string, unknown>>, query: URLSearchParams) => unknown;
