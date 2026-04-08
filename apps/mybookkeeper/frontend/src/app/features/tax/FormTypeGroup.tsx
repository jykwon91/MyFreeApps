import * as Accordion from "@radix-ui/react-accordion";
import { ChevronRight } from "lucide-react";
import { getFormLabel } from "@/shared/lib/tax-config";
import Badge from "@/shared/components/ui/Badge";
import DocumentItem from "@/app/features/tax/DocumentItem";
import type { TaxSourceDocument } from "@/shared/types/tax/source-document";

interface FormTypeGroupProps {
  formType: string;
  docs: TaxSourceDocument[];
  onView: (documentId: string) => void;
}

export default function FormTypeGroup({ formType, docs, onView }: FormTypeGroupProps) {
  const label = getFormLabel(formType);

  return (
    <Accordion.Item value={formType} className="border-t first:border-t-0">
      <Accordion.Header>
        <Accordion.Trigger className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/30 group text-left [&[data-state=open]>svg]:rotate-90">
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-150" />
          <Badge label={label} color="blue" />
          <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {docs.length}
          </span>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="pl-3 data-[state=closed]:animate-none overflow-hidden data-[state=open]:animate-none">
        {docs.map((doc) => (
          <DocumentItem key={doc.form_instance_id} doc={doc} onView={onView} />
        ))}
      </Accordion.Content>
    </Accordion.Item>
  );
}
