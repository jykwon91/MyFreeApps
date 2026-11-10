import { LEASE_TEMPLATE_SOURCE_COPY } from "@mybookkeeper/api-client/constants/leaseTemplateSource";
import type { SignedLeaseTemplateLink } from "@mybookkeeper/api-client/types/lease/signed-lease-template-link";
import { leaseTemplateSourceLabel } from "@mybookkeeper/api-client/utils/leaseTemplateSourceLabel";
import { useTheme } from "@platform/mobile";
import { Text } from "react-native";
import InquirySection from "../inquiries/InquirySection";

interface LeaseTemplateSourcesProps {
  templates: SignedLeaseTemplateLink[];
}

/** Which template (and version) each rendered document came from. Hidden until something is rendered. */
export default function LeaseTemplateSources({ templates }: LeaseTemplateSourcesProps) {
  const { colors, fontSize } = useTheme();
  const rendered = templates.filter((t) => leaseTemplateSourceLabel(t) !== null);
  if (rendered.length === 0) return null;
  return (
    <InquirySection title={LEASE_TEMPLATE_SOURCE_COPY.heading}>
      {rendered.map((t) => (
        <Text key={t.id} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {leaseTemplateSourceLabel(t)}
        </Text>
      ))}
    </InquirySection>
  );
}
