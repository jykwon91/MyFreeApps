/** Network failures carry no HTTP status, so this tells "the server said no" from "couldn't reach it". */
export function isServerAnswer(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number";
}
