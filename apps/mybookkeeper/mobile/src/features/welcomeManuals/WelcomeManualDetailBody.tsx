import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import type { WelcomeManualResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-response";
import { Banner, LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useRef } from "react";
import type { RefreshControlProps } from "react-native";
import { ScrollView, Text, View } from "react-native";
import { DELETE_MANUAL_BODY, WELCOME_MANUAL_MESSAGES as MESSAGES, countLabel, deleteManualTitle } from "../../constants/welcomeManuals";
import { askOnce } from "../../lib/askOnce";
import { plainFromMarkdown } from "../../lib/plainFromMarkdown";
import { useCanWrite } from "../workspace/useCanWrite";
import { manualPropertyName } from "./welcomeManualDisplay";
import WelcomeManualEmailRow from "./WelcomeManualEmailRow";
import WelcomeManualNavRow from "./WelcomeManualNavRow";
import { useWelcomeManualActions } from "./useWelcomeManualActions";

interface WelcomeManualDetailBodyProps {
  manual: WelcomeManualResponse;
  refreshControl: React.ReactElement<RefreshControlProps>;
  onDeleted: () => void;
}

/** The glance at one manual: what it is, and a row for each part to open on its own screen. */
export default function WelcomeManualDetailBody({ manual, refreshControl, onDeleted }: WelcomeManualDetailBodyProps) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const { currentData: properties } = useGetPropertiesQuery();
  const { remove, isDeleting, failure } = useWelcomeManualActions(manual.id, onDeleted);
  const asking = useRef(false);
  const propertyName = manualPropertyName(manual.property_id, properties);
  const base = `/welcome-manuals/${manual.id}`;
  const lockEmail = manual.sections.length === 0;

  function confirmDelete(): void {
    askOnce(asking, deleteManualTitle(manual.title), DELETE_MANUAL_BODY, { text: MESSAGES.delete, style: "destructive", onPress: () => void remove() });
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingVertical: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {manual.title}
        </Text>
        {propertyName ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{propertyName}</Text> : null}
        {manual.intro_text ? (
          <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
            {plainFromMarkdown(manual.intro_text)}
          </Text>
        ) : null}
      </View>
      {failure ? (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Banner message={failure} />
        </View>
      ) : null}
      <View>
        <WelcomeManualNavRow label={MESSAGES.sectionsRow} onPress={() => router.push(`${base}/sections`)} value={countLabel(manual.sections.length, "section", "sections")} />
        {manual.rooms.length > 0 || canWrite ? (
          <WelcomeManualNavRow label={MESSAGES.roomsRow} onPress={() => router.push(`${base}/rooms`)} value={countLabel(manual.rooms.length, "room", "rooms")} />
        ) : null}
        <WelcomeManualNavRow label={MESSAGES.placesRow} onPress={() => router.push(`${base}/places`)} value={countLabel(manual.places.length, "place", "places")} />
        <WelcomeManualNavRow label={MESSAGES.shareRow} onPress={() => router.push(`${base}/share`)} value={manual.share_token ? MESSAGES.shared : MESSAGES.notShared} />
        <WelcomeManualNavRow label={MESSAGES.previewRow} onPress={() => router.push(`${base}/preview`)} />
        {canWrite ? <WelcomeManualEmailRow base={base} hasSections={!lockEmail} /> : null}
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
