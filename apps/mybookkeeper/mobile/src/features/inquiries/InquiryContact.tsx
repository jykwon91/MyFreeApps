import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { contactLinks } from "./inquiryContactLinks";
import { useOpenLink } from "./useOpenLink";

export default function InquiryContact({ name, email, phone }: { name: string; email: string | null; phone: string | null }) {
  const { colors, spacing, fontSize } = useTheme();
  const open = useOpenLink();
  const links = contactLinks(name, email, phone);
  const writtenPhone = phone?.trim();
  const phoneCantBeDialed = Boolean(writtenPhone) && !links.some((link) => link.url.startsWith("tel:"));

  if (links.length === 0 && !writtenPhone) {
    return <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>No phone number or email.</Text>;
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {phoneCantBeDialed ? <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{`Phone: ${writtenPhone}`}</Text> : null}
      {links.map((link) => (
        <LoadingButton accessibilityLabel={link.spoken} key={link.url} onPress={() => void open(link.url)} variant="secondary">
          {link.label}
        </LoadingButton>
      ))}
    </View>
  );
}
