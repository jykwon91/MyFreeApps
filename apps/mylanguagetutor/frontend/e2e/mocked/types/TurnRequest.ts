/** One POST /sessions/{id}/turns the page sent: which session, the JSON body, and its Authorization header. */
export interface TurnRequest {
  sessionId: string;
  body: unknown;
  authorization: string | null;
}
