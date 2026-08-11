/**
 * Shape of an RTK Query / axios error whose body carries FastAPI's `detail`.
 *
 * The backend answers a rejected write with a sentence explaining what was
 * wrong with it. Discarding that in favour of a generic "please try again"
 * tells the operator to retry a request that will fail identically every time.
 */
export interface ApiErrorDetailShape {
  data?: {
    detail?: unknown;
  };
  status?: number;
}
