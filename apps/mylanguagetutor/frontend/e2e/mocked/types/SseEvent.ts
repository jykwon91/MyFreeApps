/** One server-sent event as the backend writes it: an `event:` name and a JSON `data:` body. */
export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}
