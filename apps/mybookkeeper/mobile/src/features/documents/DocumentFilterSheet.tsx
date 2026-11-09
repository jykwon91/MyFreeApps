import {
  DOCUMENT_SOURCE_OPTIONS,
  DOCUMENT_STATUS_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
} from "@mybookkeeper/api-client/constants/documentFilterOptions";
import { DEFAULT_DOCUMENT_VIEW, DOCUMENT_SORT_FIELDS } from "@mybookkeeper/api-client/constants/documentListView";
import type { DocumentListView } from "@mybookkeeper/api-client/types/document/DocumentListView";
import { LoadingButton, MIN_TOUCH_TARGET, OptionRow, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { DOCUMENT_FILTER_SHEET as SHEET } from "../../constants/documentFilters";
import ChoiceRows from "./ChoiceRows";
import DocumentFilterSection from "./DocumentFilterSection";

/** Mounted only while open, so its choices start from what's applied and Close discards them. */
export default function DocumentFilterSheet({
  view,
  onApply,
  onClose,
}: {
  view: DocumentListView;
  onApply: (view: DocumentListView) => void;
  onClose: () => void;
}) {
  const { colors, spacing, fontSize } = useTheme();
  const [draft, setDraft] = useState(view);
  const update = (change: Partial<DocumentListView>) => setDraft((current) => ({ ...current, ...change }));

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg, paddingTop: spacing.sm }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
            {SHEET.title}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.lg }}
          >
            <Text style={{ fontSize: fontSize.md, color: colors.primary }}>{SHEET.close}</Text>
          </Pressable>
        </View>
        <ScrollView>
          <DocumentFilterSection title={SHEET.status}>
            <ChoiceRows chosen={draft.statuses} onChange={(statuses) => update({ statuses })} options={DOCUMENT_STATUS_OPTIONS} />
          </DocumentFilterSection>
          <DocumentFilterSection title={SHEET.type}>
            <ChoiceRows chosen={draft.types} onChange={(types) => update({ types })} options={DOCUMENT_TYPE_OPTIONS} />
          </DocumentFilterSection>
          <DocumentFilterSection title={SHEET.source}>
            <ChoiceRows chosen={draft.sources} onChange={(sources) => update({ sources })} options={DOCUMENT_SOURCE_OPTIONS} />
          </DocumentFilterSection>
          <DocumentFilterSection title={SHEET.sortBy}>
            {DOCUMENT_SORT_FIELDS.map((field) => (
              <OptionRow isSelected={draft.sortField === field.value} key={field.value} label={field.label} onPress={() => update({ sortField: field.value })} />
            ))}
          </DocumentFilterSection>
          <DocumentFilterSection title={SHEET.order}>
            <OptionRow isSelected={draft.sortDirection === "asc"} label={SHEET.ascending} onPress={() => update({ sortDirection: "asc" })} />
            <OptionRow isSelected={draft.sortDirection === "desc"} label={SHEET.descending} onPress={() => update({ sortDirection: "desc" })} />
          </DocumentFilterSection>
        </ScrollView>
        <View style={{ flexDirection: "row", gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border }}>
          <LoadingButton
            onPress={() => setDraft({ ...DEFAULT_DOCUMENT_VIEW, search: draft.search })}
            style={{ flex: 1 }}
            variant="secondary"
          >
            {SHEET.clearAll}
          </LoadingButton>
          <LoadingButton onPress={() => onApply(draft)} style={{ flex: 2 }}>
            {SHEET.apply}
          </LoadingButton>
        </View>
      </View>
    </Modal>
  );
}
