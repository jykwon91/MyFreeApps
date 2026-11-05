import { RECONCILIATION_MESSAGES as MESSAGES } from "../../constants/reconciliation";
import { httpStatus } from "../transactions/transactionMessages";

const GATEWAY_FAILURES = [502, 503, 504];

/** Adding isn't safe to repeat: the server keeps every 1099 it's sent, so a lost reply may still have saved. */
export function addFailureMessage(error: unknown): string {
  const status = httpStatus(error);
  if (status === undefined || GATEWAY_FAILURES.includes(status)) return MESSAGES.addUnreachable;
  switch (status) {
    case 403:
      return MESSAGES.viewerRefused;
    case 422:
      return MESSAGES.addRejected;
    default:
      return MESSAGES.addFailed;
  }
}
