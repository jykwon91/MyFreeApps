import type { WelcomeManualSectionResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-response";
import { Banner, Chip, LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import { DELETE_SECTION_BODY, WELCOME_MANUAL_SECTION_MESSAGES as MESSAGES, deleteSectionTitle, photoCountLabel } from "../../constants/welcomeManualForms";
import { countLabel } from "../../constants/welcomeManuals";
import { askOnce } from "../../lib/askOnce";
import { plainFromMarkdown } from "../../lib/plainFromMarkdown";
import type { WelcomeManualView } from "../../types/WelcomeManualView";
import { useCanWrite } from "../workspace/useCanWrite";
import { roomNameFor } from "./welcomeManualRoomOptions";
import WelcomeManualNavRow from "./WelcomeManualNavRow";
import { useWelcomeManualSectionActions } from "./useWelcomeManualSectionActions";

interface WelcomeManualSectionDetailBodyProps {
  view: WelcomeManualView;
  section: WelcomeManualSectionResponse;
  onDeleted: () => void;
}

/** One section at a glance, with rows to its label and value pairs and its photos. */
export default function WelcomeManualSectionDetailBody({ view, section, onDeleted }: WelcomeManualSectionDetailBodyProps) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { remove, isDeleting, failure } = useWelcomeManualSectionActions(view.manual.id, section.id, onDeleted);
  const asking = useRef(false);
  const base = `/welcome-manuals/${view.manual.id}/sections/${section.id}`;
  const roomName = roomNameFor(view.manual.rooms, section.room_id);

  function confirmDelete(): void {
    askOnce(asking, deleteSectionTitle(section.title), DELETE_SECTION_BODY, { text: MESSAGES.delete, style: "destructive", onPress: () => void remove() });
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={view.refreshControl}>
      <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {section.title}
        </Text>
        {roomName ? <Chip label={roomName} /> : null}
        <Text selectable style={{ fontSize: fontSize.md, color: section.body ? colors.foreground : colors.mutedForeground }}>
          {section.body ? plainFromMarkdown(section.body) : MESSAGES.noText}
        </Text>
      </View>
      {failure ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Banner message={failure} />
        </View>
      ) : null}
      <View>
        <WelcomeManualNavRow label={MESSAGES.fieldsRow} onPress={() => router.push(`${base}/fields`)} value={countLabel(section.fields.length, "field", "fields")} />
        <WelcomeManualNavRow label={MESSAGES.photosRow} onPress={() => router.push(`${base}/photos`)} value={photoCountLabel(section.images.length)} />
      </View>
      {canWrite ? (
        <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
          <LoadingButton disabled={isDeleting} onPress={() => router.push(`${base}/edit`)} variant="secondary">
            {MESSAGES.edit}
          </LoadingButton>
          <LoadingButton isLoading={isDeleting} loadingText={MESSAGES.deleting} onPress={confirmDelete} variant="destructive">
            {MESSAGES.delete}
          </LoadingButton>
        </View>
      ) : null}
    </ScrollView>
  );
}
