import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { TAX_REPORT_MESSAGES as MESSAGES } from "../../constants/taxReport";
import type { TaxExport } from "../../types/TaxExport";
import { taxExports } from "./taxReportDisplay";

interface TaxReportExportsProps {
  year: number;
  canShare: boolean;
  showShare: boolean;
  sharingId: string | null;
  onShare: (taxExport: TaxExport) => Promise<void>;
}

export default function TaxReportExports({ year, canShare, showShare, sharingId, onShare }: TaxReportExportsProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }}>
      {showShare ? (
        <>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {MESSAGES.shareTitle}
          </Text>
          {taxExports(year).map((taxExport) => (
            <LoadingButton
              disabled={!canShare || (sharingId !== null && sharingId !== taxExport.id)}
              isLoading={sharingId === taxExport.id}
              key={taxExport.id}
              loadingText={MESSAGES.preparing}
              onPress={() => onShare(taxExport)}
              variant="secondary"
            >
              {taxExport.label}
            </LoadingButton>
          ))}
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.shareNote}</Text>
        </>
      ) : null}
    </View>
  );
}
