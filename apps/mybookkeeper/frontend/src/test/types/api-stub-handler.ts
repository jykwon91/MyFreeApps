/** Answers one request of a stubbed API: the response body, or a rejection for a server error. */
export type ApiStubHandler = (path: string, params: Readonly<Record<string, unknown>>) => unknown;
