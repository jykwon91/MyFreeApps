import type { ReplyTemplatesListMode } from "@/shared/types/inquiry/reply-templates-list-mode";
import type { ReplyTemplate } from "@/shared/types/inquiry/reply-template";
import ReplyTemplatesEmpty from "./ReplyTemplatesEmpty";
import ReplyTemplatesList from "./ReplyTemplatesList";
import ReplyTemplatesLoading from "./ReplyTemplatesLoading";

export interface ReplyTemplatesListBodyProps {
  mode: ReplyTemplatesListMode;
  templates: readonly ReplyTemplate[];
  onEdit: (template: ReplyTemplate) => void;
  onArchive: (template: ReplyTemplate) => void;
}

export default function ReplyTemplatesListBody({
  mode,
  templates,
  onEdit,
  onArchive,
}: ReplyTemplatesListBodyProps) {
  switch (mode) {
    case "loading":
      return <ReplyTemplatesLoading />;
    case "empty":
      return <ReplyTemplatesEmpty />;
    case "list":
      return (
        <ReplyTemplatesList
          templates={templates}
          onEdit={onEdit}
          onArchive={onArchive}
        />
      );
  }
}
