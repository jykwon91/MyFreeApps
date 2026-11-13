/** One entry of FastAPI's 422 body: a pydantic error with its location prefixed by "body". */
export interface ValidationIssue {
  type: string;
  loc: (string | number)[];
  msg: string;
  input: unknown;
  ctx?: Record<string, unknown>;
}
