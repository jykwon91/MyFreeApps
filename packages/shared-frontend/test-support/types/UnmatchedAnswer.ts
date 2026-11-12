/**
 * How a mocked spec answers API calls it does not stub itself:
 * - "notFound": 404 with FastAPI's `{ detail: "Not Found" }`, so a page that
 *   reads something unexpected shows its error state.
 * - "empty": 200 with `[]` for a GET and `{}` otherwise, so panels the spec
 *   doesn't care about render as empty.
 */
export type UnmatchedAnswer = "notFound" | "empty";
