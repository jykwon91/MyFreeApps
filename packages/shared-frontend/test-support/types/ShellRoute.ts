/** One read the signed-in shell makes, answered with a fixed JSON body. */
export interface ShellRoute {
  /** The path after the API base, like "/organizations". Matched exactly, without a query string. */
  path: string;
  body: unknown;
  /** 200 unless given. */
  status?: number;
}
