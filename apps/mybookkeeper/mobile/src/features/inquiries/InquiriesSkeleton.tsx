import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { INQUIRY_LOADING_MESSAGES } from "../../constants/inquiries";

const ROWS = ["a", "b", "c", "d", "e", "f"];

export function InquirySkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Skeleton height={20} width="55%" />
      <Skeleton height={14} width="70%" />
      <Skeleton height={14} width="45%" />
      <Skeleton height={32} />
      <Skeleton height={20} width="30%" />
    </View>
  );
}

export default function InquiriesSkeleton() {
  return (
    <LoadingRegion label={INQUIRY_LOADING_MESSAGES.list} testID="inquiries-skeleton">
      {ROWS.map((row) => (
        <InquirySkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
