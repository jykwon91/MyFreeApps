import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { LEASE_MESSAGES } from "../../constants/leases";

const FILES = ["a", "b", "c"];

export default function LeaseDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessibilityLabel={LEASE_MESSAGES.loadingOne} style={{ gap: spacing.xl, padding: spacing.lg }} testID="lease-skeleton">
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={28} width="60%" />
        <Skeleton height={20} width="25%" />
      </View>
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={16} width="20%" />
        <Skeleton height={20} width="85%" />
        <Skeleton height={14} width="35%" />
      </View>
      <Skeleton height={44} width="100%" />
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={16} width="20%" />
        <Skeleton height={20} width="30%" />
        <Skeleton height={44} width="100%" />
      </View>
      <View style={{ gap: spacing.sm }}>
        <Skeleton height={16} width="20%" />
        <Skeleton height={20} width="75%" />
        <Skeleton height={44} width="100%" />
      </View>
      {FILES.map((file) => (
        <View key={file} style={{ gap: spacing.sm }}>
          <Skeleton height={20} width="70%" />
          <Skeleton height={14} width="45%" />
          <Skeleton height={44} width="100%" />
        </View>
      ))}
    </View>
  );
}
