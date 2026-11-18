import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";

export default function ReplyTemplateDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={REPLY_TEMPLATE_MESSAGES.loadingOne} style={{ gap: spacing.md, padding: spacing.lg }} testID="reply-template-detail-skeleton">
      <Skeleton height={28} width="60%" />
      <Skeleton height={44} />
      <Skeleton height={160} />
      <Skeleton height={100} />
    </LoadingRegion>
  );
}
