import { LoadingRegion, Skeleton, useAnnouncement, useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { LEASE_TEMPLATE_FORM_MESSAGES } from "../../constants/leaseTemplateForm";

/** Shown while the AI reads a template just uploaded. It can take several seconds. */
export default function LeaseTemplateReading() {
  const { colors, spacing, fontSize } = useTheme();
  useAnnouncement(LEASE_TEMPLATE_FORM_MESSAGES.reading);
  return (
    <LoadingRegion accessibilityLiveRegion="polite" label={LEASE_TEMPLATE_FORM_MESSAGES.reading} style={{ gap: spacing.md, padding: spacing.lg }} testID="lease-template-reading">
      <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{LEASE_TEMPLATE_FORM_MESSAGES.reading}</Text>
      <Skeleton height={16} width="60%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
    </LoadingRegion>
  );
}
