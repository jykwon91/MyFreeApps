/** A GET a spec logged on its way to the stub. */
export interface LoggedRead {
  url: string;
  /** When the request reached the route (Date.now() in the test runner). */
  at: number;
}
