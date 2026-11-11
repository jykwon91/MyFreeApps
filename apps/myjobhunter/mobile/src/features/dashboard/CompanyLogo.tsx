import { companyLogoUrl } from "@myjobhunter/api-client/utils/companyLogoUrl";
import { useTheme } from "@platform/mobile";
import { Image, View } from "react-native";
import { COMPANY_LOGO_SIZE } from "../../constants/dashboard";
import type { CompanyLogoProps } from "../../types/CompanyLogoProps";

/** The company's logo when it has a web address, else a plain circle. Decoration: the name is beside it. */
export default function CompanyLogo({ url }: CompanyLogoProps) {
  const { colors, radius } = useTheme();
  const safeUrl = companyLogoUrl(url);
  const style = { width: COMPANY_LOGO_SIZE, height: COMPANY_LOGO_SIZE, borderRadius: radius.full, backgroundColor: colors.muted };
  return safeUrl ? (
    <Image accessibilityIgnoresInvertColors accessible={false} source={{ uri: safeUrl }} style={style} testID="company-logo" />
  ) : (
    <View accessible={false} style={style} testID="company-logo-placeholder" />
  );
}
