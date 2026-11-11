import { Badge } from "@platform/ui";
import { documentKindLabel, documentKindTone } from "@myjobhunter/api-client/utils/documentKind";
import { STATUS_TONE_BADGE_COLORS } from "@/constants/statusToneBadgeColors";

export interface DocumentKindBadgeProps {
  kind: string;
}

export default function DocumentKindBadge({ kind }: DocumentKindBadgeProps) {
  return <Badge label={documentKindLabel(kind)} color={STATUS_TONE_BADGE_COLORS[documentKindTone(kind)]} />;
}
