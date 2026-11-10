import { REMOTE_TYPE_LABELS } from "../constants/remoteTypeLabels";
import type { RemoteType } from "../types/application/remote-type";

/** True for a remote type this client knows; the column is a plain string on the wire. */
export function isRemoteType(value: string): value is RemoteType {
  return Object.prototype.hasOwnProperty.call(REMOTE_TYPE_LABELS, value);
}
