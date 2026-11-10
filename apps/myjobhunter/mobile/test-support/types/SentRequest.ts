export interface SentRequest {
  route: string;
  body: Record<string, unknown>;
  authorization: string | undefined;
}
