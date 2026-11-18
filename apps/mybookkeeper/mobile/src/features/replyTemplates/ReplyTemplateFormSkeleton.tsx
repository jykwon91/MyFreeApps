import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { REPLY_TEMPLATE_MESSAGES } from "../../constants/replyTemplates";

export default function ReplyTemplateFormSkeleton() {
  const { spacing } = useTheme();
  return (
    <LoadingRegion label={REPLY_TEMPLATE_MESSAGES.loadingOne} style={{ gap: spacing.md, padding: spacing.lg }} testID="reply-template-form-skeleton">
      <Skeleton height={48} />
      <Skeleton height={48} />
      <Skeleton height={220} />
    </LoadingRegion>
  );
}
