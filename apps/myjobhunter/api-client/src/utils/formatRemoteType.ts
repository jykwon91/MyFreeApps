import { REMOTE_TYPE_LABELS } from "../constants/remoteTypeLabels";
import { isRemoteType } from "./isRemoteType";

/** Null when the application doesn't say, so the caller picks how to show nothing. */
export function formatRemoteType(remoteType: string): string | null {
  if (isRemoteType(remoteType)) return REMOTE_TYPE_LABELS[remoteType];
  return remoteType === "" ? null : remoteType.charAt(0).toUpperCase() + remoteType.slice(1);
}
