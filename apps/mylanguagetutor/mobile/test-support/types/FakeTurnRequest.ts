/** A turn the screen sent, as the fake server saw it. */
export interface FakeTurnRequest {
  path: string;
  authorization: string | undefined;
  text: string;
}
