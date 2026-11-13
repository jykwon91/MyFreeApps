import { isRouteErrorResponse } from "react-router-dom";

/**
 * One line for whatever a route threw: a route Response as "404 Not Found",
 * an Error as its message.
 */
export function describeRouteError(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}
