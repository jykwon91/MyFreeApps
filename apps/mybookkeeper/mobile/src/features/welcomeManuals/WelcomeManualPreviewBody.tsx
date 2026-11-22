import { SHARED_ROOM_OPTION } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { sectionsForScope } from "@mybookkeeper/api-client/utils/welcomeManualScope";
import { EmptyState, KeyboardAwareScroll, OptionSheet, PickerField, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text } from "react-native";
import { WELCOME_MANUAL_PREVIEW_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import type { WelcomeManualView } from "../../types/WelcomeManualView";
import MarkdownText from "../markdown/MarkdownText";
import { previewScopeOptions } from "./welcomeManualPreviewOptions";
import WelcomeManualPlaceDirectory from "./WelcomeManualPlaceDirectory";
import WelcomeManualSection from "./WelcomeManualSection";

/** The manual as a guest reads it. A by-the-room manual is previewed one scope at a time. */
export default function WelcomeManualPreviewBody({ manual, refreshControl, refresh }: WelcomeManualView) {
  const { colors, spacing, fontSize } = useTheme();
  const [scope, setScope] = useState(SHARED_ROOM_OPTION);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const options = previewScopeOptions(manual.rooms);
  // A room deleted elsewhere falls back to the shared view instead of an empty one.
  const activeScope = options.some((option) => option.value === scope) ? scope : SHARED_ROOM_OPTION;
  const sections = sectionsForScope(manual.sections, activeScope);
  const isEmpty = sections.length === 0 && manual.places.length === 0 && !manual.intro_text;

  return (
    <>
      <KeyboardAwareScroll contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
        {manual.rooms.length > 0 ? (
          <PickerField label={MESSAGES.scopeLabel} onPress={() => setIsPickerOpen(true)} valueLabel={options.find((option) => option.value === activeScope)?.label ?? ""} />
        ) : null}
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {manual.title}
        </Text>
        {manual.intro_text ? <MarkdownText source={manual.intro_text} /> : null}
        {isEmpty ? <EmptyState body="" heading={MESSAGES.noSections} /> : null}
        {sections.map((section) => (
          <WelcomeManualSection key={section.id} onRetryPhoto={refresh} section={section} />
        ))}
        <WelcomeManualPlaceDirectory places={manual.places} />
      </KeyboardAwareScroll>
      <OptionSheet
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(value) => {
          setIsPickerOpen(false);
          setScope(value);
        }}
        options={options}
        title={MESSAGES.chooseScope}
        value={activeScope}
      />
    </>
  );
}
