import { useEffect } from "react";
import { AppState } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../lib/store";
import { drainUploadQueue } from "./drainUploadQueue";

/** Picks up what's left from last time, and retries when the app comes back: often back online. */
export function useResumeUploads(): void {
  const dispatch = useDispatch<AppDispatch>();
  const workspaceId = useSelector((state: RootState) => state.workspace.activeId);

  useEffect(() => {
    if (!workspaceId) return;
    void dispatch(drainUploadQueue());
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void dispatch(drainUploadQueue());
    });
    return () => subscription.remove();
  }, [dispatch, workspaceId]);
}
