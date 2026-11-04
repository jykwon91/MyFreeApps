import { httpStatus } from "../transactions/transactionMessages";

/** The server's own wording can be a developer string, so it's never shown. */
export function inquiryWriteFailure(error: unknown, otherwise: string): string {
  const status = httpStatus(error);
  if (status === 403) return "You have view-only access.";
  return status === 404 ? "I can't find that inquiry anymore." : otherwise;
}
