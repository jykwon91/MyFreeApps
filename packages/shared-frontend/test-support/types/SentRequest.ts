/** A write the page sent to a stubbed API: HTTP method, path under the API base, and the JSON body (null when there is none). */
export interface SentRequest {
  method: string;
  path: string;
  body: unknown;
}
