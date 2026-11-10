import type { LeaseTemplatePlaceholder } from "@mybookkeeper/api-client/types/lease/lease-template-placeholder";

export interface PlaceholderRowProps {
  placeholder: LeaseTemplatePlaceholder;
  /** Absent for someone who can't change it: the row is then just read. */
  onPress?: () => void;
}
