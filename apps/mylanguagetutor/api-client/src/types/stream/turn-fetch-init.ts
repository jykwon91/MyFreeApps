/** The request ``createStreamTurn`` hands its injected ``fetch``. */
export interface TurnFetchInit {
  method: "POST";
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}
