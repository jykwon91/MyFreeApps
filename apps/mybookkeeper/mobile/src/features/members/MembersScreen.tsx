import { canManageMember } from "@mybookkeeper/api-client/utils/canManageMember";
import { useListInvitesQuery, useListMembersQuery } from "@mybookkeeper/api-client/store/membersApi";
import type { AssignableRole } from "@mybookkeeper/api-client/types/organization/AssignableRole";
import type { OrgMember } from "@mybookkeeper/api-client/types/organization/OrgMember";
import { Banner, EmptyState, LoadingButton, useRefresh, useSession, useTheme } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { MEMBERS_MESSAGES as MESSAGES } from "../../constants/members";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useToday } from "../../lib/useToday";
import type { Workspace } from "../../types/Workspace";
import { isServerAnswer } from "../../utils/isServerAnswer";
import { askOnce } from "../leases/askOnce";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { useListWorkspacesQuery } from "../workspace/workspaceApi";
import InviteSheet from "./InviteSheet";
import MemberRow from "./MemberRow";
import MembersSkeleton from "./MembersSkeleton";
import MemberSheet from "./MemberSheet";
import { isSameEmail, memberFirstName, memberName } from "./membersDisplay";
import PendingInviteRow from "./PendingInviteRow";
import { useInviteActions } from "./useInviteActions";
import { useMemberActions } from "./useMemberActions";

const NEW_INVITE = { email: "", role: "user", resendingTo: null } as const;

export default function MembersScreen({ workspace }: { workspace: Workspace }) {
  const { colors, spacing, fontSize } = useTheme();
  const { session } = useSession();
  const now = useToday();
  const sessionState = session.getState();
  const myEmail = sessionState.status === "signedIn" ? sessionState.email : null;
  const isAdmin = workspace.org_role === "owner" || workspace.org_role === "admin";
  const members = useListMembersQuery(workspace.id);
  const invitesQuery = useListInvitesQuery(workspace.id, { skip: !isAdmin });
  const { refetch: refetchWorkspaces } = useListWorkspacesQuery();
  const { busy: memberBusy, changeRole, removeMember } = useMemberActions(workspace.id);
  const { busy: inviteBusy, cancelInvite, sendInvite } = useInviteActions(workspace.id, workspace.name);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [inviteSeed, setInviteSeed] = useState<{ email: string; role: AssignableRole; resendingTo: string | null } | null>(null);
  const asking = useRef(false);

  async function refetchAll(): Promise<void> {
    await Promise.all([members.refetch(), isAdmin ? invitesQuery.refetch() : undefined]);
  }
  const { refresh, refreshControl } = useRefresh(refetchAll, members.error);

  // Refused means my role here changed since the phone last asked.
  const wasRefused = httpStatus(members.error) === 403 || httpStatus(invitesQuery.error) === 403;
  useEffect(() => {
    if (wasRefused) void refetchWorkspaces();
  }, [wasRefused, refetchWorkspaces]);

  const people = members.currentData;
  // By id, so an open sheet follows the list, and closes if they're gone.
  const chosen = people?.find((member) => member.user_id === chosenId);
  const isAnythingBusy = Object.keys(memberBusy).length > 0 || Object.keys(inviteBusy).length > 0;
  const invites = isAdmin ? invitesQuery.currentData : undefined;
  const pending = invites?.filter((invite) => invite.status === "pending");
  const showingOld = Boolean((members.error && people) || (invitesQuery.error && invites));

  function chooseRole(member: OrgMember, role: AssignableRole): void {
    const apply = () => {
      setChosenId(null);
      void changeRole(member, role);
    };
    if (role !== "admin") {
      apply();
      return;
    }
    askOnce(asking, MESSAGES.promoteTitle(memberName(member)), MESSAGES.promoteBody, { text: MESSAGES.promoteConfirm, onPress: apply });
  }

  function askToRemove(member: OrgMember): void {
    askOnce(asking, MESSAGES.removeTitle(memberName(member)), MESSAGES.removeBody(workspace.name), {
      text: MESSAGES.removeConfirm(memberFirstName(member)),
      style: "destructive",
      onPress: () => {
        setChosenId(null);
        void removeMember(member);
      },
    });
  }

  function body() {
    if (!people) {
      if (members.isFetching) return <MembersSkeleton isAdmin={isAdmin} />;
      return (
        <EmptyState
          action={{ label: MESSAGES.tryAgain, onPress: refresh }}
          body={isServerAnswer(members.error) ? MESSAGES.tryAgainLater : MESSAGES.checkConnection}
          heading={MESSAGES.couldntLoad}
        />
      );
    }
    return (
      <>
        {isAdmin && !workspace.is_demo ? <LoadingButton disabled={isAnythingBusy} onPress={() => setInviteSeed(NEW_INVITE)}>{MESSAGES.inviteSomeone}</LoadingButton> : null}
        {isAdmin && workspace.is_demo ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.demoNote}</Text> : null}
        {isAdmin ? null : <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.onlyAdmins}</Text>}
        <View>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.people(people.length)}
          </Text>
          {people.map((member) => (
            <MemberRow
              busyLabel={memberBusy[member.user_id]}
              canEdit={canManageMember(member, workspace.org_role, isSameEmail(member.user_email, myEmail))}
              isHeld={isAnythingBusy}
              isMe={isSameEmail(member.user_email, myEmail)}
              key={member.id}
              member={member}
              onPress={() => setChosenId(member.user_id)}
            />
          ))}
        </View>
        {isAdmin ? pendingSection() : null}
      </>
    );
  }

  function pendingSection() {
    if (!pending) {
      if (invitesQuery.isFetching) return <MembersSkeleton isAdmin={false} />;
      return (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.couldntLoadInvites}</Text>
          <LoadingButton onPress={refresh} variant="secondary">
            {MESSAGES.tryAgain}
          </LoadingButton>
        </View>
      );
    }
    return (
      <View>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {MESSAGES.waiting(pending.length)}
        </Text>
        {pending.length === 0 ? <Text style={{ paddingVertical: spacing.sm, fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.noneWaiting}</Text> : null}
        {pending.map((invite) => (
          <PendingInviteRow
            busyLabel={inviteBusy[invite.id]}
            invite={invite}
            isHeld={isAnythingBusy}
            key={invite.id}
            now={now}
            onCancel={() => cancelInvite(invite)}
            onInviteAgain={() => setInviteSeed({ email: invite.email, role: invite.org_role === "owner" ? "user" : invite.org_role, resendingTo: invite.email })}
          />
        ))}
      </View>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={refreshControl}
        testID="members-list"
      >
        {showingOld ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
        {body()}
      </ScrollView>
      {isAdmin && chosen ? (
        <MemberSheet
          member={chosen}
          onChooseRole={(role) => chooseRole(chosen, role)}
          onClose={() => setChosenId(null)}
          onRemove={() => askToRemove(chosen)}
          orgName={workspace.name}
        />
      ) : null}
      {isAdmin && inviteSeed ? (
        <InviteSheet
          initialEmail={inviteSeed.email}
          initialRole={inviteSeed.role}
          onClose={() => setInviteSeed(null)}
          onSend={(email, role) => sendInvite({ email, role, members: people ?? [], invites: pending ?? [], resendingTo: inviteSeed.resendingTo, now })}
          orgName={workspace.name}
        />
      ) : null}
    </>
  );
}
