import type { WelcomeManualsServer } from "./welcomeManualsServer";

export interface SentWrite {
  method: string;
  url: string;
  body: Record<string, unknown>;
}

/** The writes sent so far, in order, with their JSON bodies read. Uploads show an empty body. */
export function writesTo(server: WelcomeManualsServer, urlEndsWith = ""): SentWrite[] {
  return server.requests
    .filter((request) => request.method?.toLowerCase() !== "get" && (request.url ?? "").endsWith(urlEndsWith))
    .map((request) => ({
      method: (request.method ?? "").toLowerCase(),
      url: request.url ?? "",
      body: typeof request.data === "string" && request.data ? (JSON.parse(request.data) as Record<string, unknown>) : {},
    }));
}
