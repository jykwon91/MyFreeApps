import { Banner, LoadingButton, useOpenWebsite, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { deleteTemplateTitle, LEASE_TEMPLATE_MESSAGES as MESSAGES } from "../../constants/leaseTemplates";
import { NEW_LEASE_MESSAGES } from "../../constants/newLease";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { askOnce } from "../../lib/askOnce";
import { nextPath } from "../newLease/newLeaseFlow";
import AiSuggestionsCard from "./AiSuggestionsCard";
import { inDisplayOrder, placeholdersLine } from "./leaseTemplateDisplay";
import { takeSuggestions } from "./leaseTemplateSuggestions";
import LeaseTemplateFileRow from "./LeaseTemplateFileRow";
import { useDeleteLeaseTemplate } from "./useDeleteLeaseTemplate";
import { useOpenTemplateFile } from "./useOpenTemplateFile";
import type { LeaseTemplateDetailBodyProps } from "../../types/LeaseTemplateDetailBodyProps";

export default function LeaseTemplateDetailBody({ template, canWrite, hasStaleData, refreshControl, onDeleted }: LeaseTemplateDetailBodyProps) {
  const { colors, spacing, fontSize } = useTheme();
  const openWebsite = useOpenWebsite();
  const asking = useRef(false);
  const { openingId, open } = useOpenTemplateFile(template.id);
  const { remove, isDeleting, message } = useDeleteLeaseTemplate(template.id, onDeleted);
  // Taken once, when the screen opens right after an upload; a later visit doesn't show them again.
  const [suggestions, setSuggestions] = useState(() => takeSuggestions(template.id));
  const sectionHeading = { fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground } as const;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.xl, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl} testID="lease-template-detail">
      {hasStaleData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {message ? <Banner message={message} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {template.name}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`Version ${template.version}`}</Text>
      </View>
      {canWrite ? <LoadingButton disabled={isDeleting} onPress={() => router.push(nextPath({ templateIds: [template.id] }))}>{NEW_LEASE_MESSAGES.useTemplate}</LoadingButton> : null}
      {template.description ? (
        <Text selectable style={{ fontSize: fontSize.md, color: colors.foreground }}>
          {template.description}
        </Text>
      ) : null}
      {suggestions ? <AiSuggestionsCard onDismiss={() => setSuggestions(null)} savedKeys={new Set(template.placeholders.map((placeholder) => placeholder.key))} suggestions={suggestions} /> : null}
      <View style={{ gap: spacing.md }}>
        <Text accessibilityRole="header" style={sectionHeading}>
          {MESSAGES.files}
        </Text>
        {template.files.length === 0 ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.noFiles}</Text> : null}
        {inDisplayOrder(template.files).map((file) => (
          <LeaseTemplateFileRow file={file} isDisabled={openingId !== null} isOpening={openingId === file.id} key={file.id} onOpen={() => void open(file)} />
        ))}
      </View>
      <View style={{ gap: spacing.sm }}>
        <Text accessibilityRole="header" style={sectionHeading}>
          {MESSAGES.placeholders}
        </Text>
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{placeholdersLine(template.placeholders.length)}</Text>
        {template.placeholders.length > 0 ? (
          <LoadingButton onPress={() => router.push(`/lease-templates/${template.id}/placeholders`)} variant="secondary">
            {canWrite ? MESSAGES.reviewPlaceholders : MESSAGES.seePlaceholders}
          </LoadingButton>
        ) : null}
      </View>
      {canWrite ? (
        <LoadingButton
          disabled={isDeleting}
          isLoading={isDeleting}
          loadingText={MESSAGES.deleting}
          onPress={() =>
            askOnce(asking, deleteTemplateTitle(template.name), MESSAGES.deleteBody, {
              text: MESSAGES.delete,
              style: "destructive",
              onPress: () => void remove(),
            })
          }
          variant="destructive"
        >
          {MESSAGES.delete}
        </LoadingButton>
      ) : null}
      <LoadingButton accessibilityLabel={MESSAGES.openOneOnWebsite} onPress={() => openWebsite(WEB_BASE_URL, `/lease-templates/${template.id}`)} variant="ghost">
        {MESSAGES.openWebsite}
      </LoadingButton>
    </ScrollView>
  );
}
