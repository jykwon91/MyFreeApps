import { useToast } from "@platform/mobile";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { MEMBERS_MESSAGES } from "../../constants/members";
import type { RootState } from "../../lib/store";
import { workspaceLost } from "./workspaceSlice";

/** WorkspaceGate sits outside the toasts, so this says what it did. */
export default function WorkspaceLostToast() {
  const lost = useSelector((state: RootState) => state.workspace.lostWorkspace);
  const dispatch = useDispatch();
  const { showToast } = useToast();

  useEffect(() => {
    if (!lost) return;
    showToast(MEMBERS_MESSAGES.workspaceLost(lost.from, lost.to), "error");
    dispatch(workspaceLost(null));
  }, [lost, dispatch, showToast]);

  return null;
}
