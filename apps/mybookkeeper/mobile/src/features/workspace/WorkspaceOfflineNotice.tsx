import { Banner } from "@platform/mobile";
import { useSelector } from "react-redux";
import { WORKSPACE_MESSAGES as MESSAGES } from "../../constants/workspace";
import type { RootState } from "../../lib/store";
import { useCanWrite } from "./useCanWrite";

/** Says the open workspace is the one saved on this phone, while the list of workspaces can't be reached. */
export default function WorkspaceOfflineNotice() {
  const remembered = useSelector((state: RootState) => state.workspace.remembered);
  const canWrite = useCanWrite();
  if (!remembered) return null;
  const message = canWrite ? MESSAGES.offlineCanCapture(remembered.name) : MESSAGES.offlineReadOnly(remembered.name);
  return <Banner message={message} tone="info" />;
}
