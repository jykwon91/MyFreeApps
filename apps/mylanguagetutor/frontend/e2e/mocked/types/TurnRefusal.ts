/** A turn the server refuses before the stream opens: an HTTP status and its `detail` code. */
export interface TurnRefusal {
  kind: "refusal";
  status: number;
  detail: string;
}
