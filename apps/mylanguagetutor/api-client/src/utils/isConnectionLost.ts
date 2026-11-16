import { CONNECTION_LOST } from "../constants/turnFailureCodes";
import { TurnRequestError } from "../errors/TurnRequestError";

/** The turn's connection went quiet mid-turn, so it ends like a stream that closed early. */
export function isConnectionLost(err: unknown): boolean {
  return err instanceof TurnRequestError && err.detail === CONNECTION_LOST;
}
