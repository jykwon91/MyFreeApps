import { Skeleton, useTheme } from "@platform/mobile";
import { type ReactNode, useEffect } from "react";
import { AppState, Linking, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { WEB_BASE_URL } from "../../constants/api";
import type { RootState } from "../../lib/store";
import { useListWorkspacesQuery } from "./workspaceApi";
import WorkspaceMessage from "./WorkspaceMessage";
import { workspaceChosen } from "./workspaceSlice";

/** Almost every request needs a workspace, so nothing renders until there is one. */
export default function WorkspaceGate({ children }: { children: ReactNode }) {
  const { data, error, refetch } = useListWorkspacesQuery();
  const activeId = useSelector((state: RootState) => state.workspace.activeId);
  const dispatch = useDispatch();
  const { colors, spacing } = useTheme();
  const isActiveKnown = data?.some((workspace) => workspace.id === activeId) ?? false;

  useEffect(() => {
    if (data && !isActiveKnown) dispatch(workspaceChosen(data[0]?.id ?? null));
  }, [data, isActiveKnown, dispatch]);

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
        action={{ label: "Open the website", onPress: () => Linking.openURL(WEB_BASE_URL) }}
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
