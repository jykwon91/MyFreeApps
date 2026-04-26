import { CheckCircle2, AlertCircle, Upload } from "lucide-react";
import { getFormLabel } from "@/shared/lib/tax-config";
import Badge from "@/shared/components/ui/Badge";
import type { ChecklistItem } from "@/shared/types/tax/source-document";

interface CompletenessChecklistProps {
  items: ChecklistItem[];
}

export default function CompletenessChecklist({ items }: CompletenessChecklistProps) {
  if (items.length === 0) {
    return null;
  }

  const receivedCount = items.filter((i) => i.status === "received").length;
  const missingCount = items.filter((i) => i.status === "missing").length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-muted border-b flex items-center justify-between">
        <span className="text-sm font-medium">Document Checklist</span>
        <span className="text-xs text-muted-foreground">
          {receivedCount} received, {missingCount} missing
        </span>
      </div>
      <ul className="divide-y">
        {items.map((item, index) => {
          const isReceived = item.status === "received";
          return (
            <li key={`${item.expected_type}-${item.expected_from}-${index}`} className="px-4 py-3 flex items-start gap-3">
              {isReceived ? (
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge
                    label={getFormLabel(item.expected_type)}
                    color={isReceived ? "green" : "yellow"}
                  />
                  {item.expected_from ? (
                    <span className="text-sm font-medium">{item.expected_from}</span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>
              </div>
              <div className="shrink-0">
                {isReceived ? (
                  <Badge label="Received" color="green" />
                ) : (
                  <a
                    href="/documents"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium px-2 py-1.5 rounded hover:bg-primary/5 min-h-[44px]"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
