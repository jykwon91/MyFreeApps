import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { rejectedWriteDetail } from "@mybookkeeper/api-client/utils/rejectedWriteDetail";
import { HOLDINGS_MESSAGES as MSG } from "@/shared/lib/holdings-messages";

const CONFLICT = 409;

/** The toast for a refused add or edit: the duplicate case in plain words, else the server's reason. */
export function holdingWriteError(error: unknown): string {
  return httpStatus(error) === CONFLICT ? MSG.duplicate : rejectedWriteDetail(error, MSG.saveFailed);
}
