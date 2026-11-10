import { baseApi } from "@platform/core/store/baseApi";
import { Skeleton, useOpenWebsite, useTheme } from "@platform/mobile";
import { type ReactNode, useEffect, useRef } from "react";
import { AppState, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { WEB_BASE_URL } from "../../constants/api";
import type { AppDispatch, RootState } from "../../lib/store";
import type { Workspace } from "../../types/Workspace";
import { useListWorkspacesQuery } from "./workspaceApi";
import WorkspaceMessage from "./WorkspaceMessage";
import { workspaceChosen, workspaceLost } from "./workspaceSlice";

/** Almost every request needs a workspace, so nothing renders until there is one. */
export default function WorkspaceGate({ children }: { children: ReactNode }) {
  const { data, error, refetch } = useListWorkspacesQuery();
  const activeId = useSelector((state: RootState) => state.workspace.activeId);
  const dispatch = useDispatch<AppDispatch>();
  const { colors, spacing } = useTheme();
  const openWebsite = useOpenWebsite();
  const active = data?.find((workspace) => workspace.id === activeId);
  const isActiveKnown = active !== undefined;
  const lastActive = useRef<Workspace | null>(null);

  useEffect(() => {
    if (active) lastActive.current = active;
  }, [active]);

  useEffect(() => {
    if (!data || isActiveKnown) return;
    const next = data[0] ?? null;
    const lost = lastActive.current?.id === activeId ? lastActive.current : null;
    lastActive.current = null;
    dispatch(workspaceChosen(next?.id ?? null));
    if (!lost) return;
    dispatch(workspaceLost(next ? { from: lost.name, to: next.name } : null));
    // The cache isn't keyed by workspace, so what's in it belongs to the one they just lost.
    dispatch(baseApi.util.resetApiState());
  }, [data, isActiveKnown, activeId, dispatch]);

  // Someone removed from their workspace would otherwise get refused on every request.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active") void refetch();
    });
    return () => subscription.remove();
  }, [refetch]);

  async function tryAgain(): Promise<void> {
    await refetch();
  }

  if (!data && error) {
    return "status" in error && error.status === undefined ? (
      <WorkspaceMessage
        action={{ label: "Try again", onPress: tryAgain }}
        body="You're still signed in. Your workspaces will load when you're back online."
        canSignOut={false}
        heading="You're offline"
      />
    ) : (
      <WorkspaceMessage
        action={{ label: "Try again", onPress: tryAgain }}
        body="Something went wrong on our side. Try again in a moment."
        heading="Couldn't load your workspaces"
      />
    );
  }
  if (data?.length === 0) {
    return (
      <WorkspaceMessage
        action={{ label: "Open the website", onPress: () => openWebsite(WEB_BASE_URL, "/") }}
        body="You're signed in, but you're not part of a workspace. Ask the owner to invite you, or set one up on the website."
        heading="No workspace yet"
      />
    );
  }
  if (!isActiveKnown) {
    return (
      <View style={{ flex: 1, gap: spacing.md, padding: spacing.lg, backgroundColor: colors.background }} testID="workspace-skeleton">
        <Skeleton height={32} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </View>
    );
  }
  return children;
}
