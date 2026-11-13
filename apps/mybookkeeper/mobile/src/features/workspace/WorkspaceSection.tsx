import { ROLE_LABELS } from "@mybookkeeper/api-client/constants/orgRoles";
import { useListOrganizationsQuery } from "@mybookkeeper/api-client/store/organizationsApi";
import { OptionSheet, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { WORKSPACE_MESSAGES as MESSAGES } from "../../constants/workspace";
import CreateWorkspaceSheet from "./CreateWorkspaceSheet";
import { useActiveWorkspace } from "./useActiveWorkspace";
import { useCreateWorkspace } from "./useCreateWorkspace";
import { useSwitchWorkspace } from "./useSwitchWorkspace";
import WorkspaceActionRow from "./WorkspaceActionRow";

/** The workspace that's open, a way to another when there is one, and a way to make one. */
export default function WorkspaceSection() {
  const { colors, fontSize, spacing } = useTheme();
  const { data: workspaces = [] } = useListOrganizationsQuery();
  const active = useActiveWorkspace();
  const switchTo = useSwitchWorkspace();
  const createWorkspace = useCreateWorkspace();
  const { showToast } = useToast();
  const [isSwitching, setIsSwitching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const current = active ? MESSAGES.current(active.name, ROLE_LABELS[active.org_role]) : undefined;
  const canSwitch = workspaces.length > 1;

  function choose(workspaceId: string): void {
    setIsSwitching(false);
    const chosen = workspaces.find((workspace) => workspace.id === workspaceId);
    if (!chosen || chosen.id === active?.id) return;
    switchTo(chosen.id, workspaces);
    showToast(MESSAGES.switched(chosen.name));
  }

  return (
    <View testID="workspace-section">
      <Text accessibilityRole="header" style={{ color: colors.mutedForeground, fontSize: fontSize.sm, fontWeight: "700", marginBottom: spacing.xs }}>
        {MESSAGES.section}
      </Text>
      {canSwitch ? (
        <WorkspaceActionRow hint={MESSAGES.switchHint} label={MESSAGES.switchWorkspace} onPress={() => setIsSwitching(true)} secondary={current} />
      ) : (
        <Text style={{ color: colors.foreground, fontSize: fontSize.md, paddingVertical: spacing.xs }}>{current}</Text>
      )}
      <WorkspaceActionRow hint={MESSAGES.newWorkspaceHint} label={MESSAGES.newWorkspace} onPress={() => setIsCreating(true)} />
      {canSwitch ? (
        <OptionSheet
          description={MESSAGES.switchDescription}
          isOpen={isSwitching}
          onClose={() => setIsSwitching(false)}
          onSelect={choose}
          options={workspaces.map((workspace) => ({ value: workspace.id, label: MESSAGES.current(workspace.name, ROLE_LABELS[workspace.org_role]) }))}
          title={MESSAGES.switchTitle}
          value={active?.id ?? null}
        />
      ) : null}
      {isCreating ? <CreateWorkspaceSheet onClose={() => setIsCreating(false)} onCreate={createWorkspace} /> : null}
    </View>
  );
}
