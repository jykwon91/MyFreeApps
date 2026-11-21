import { LoadingRegion } from "@platform/ui";
export default function CalendarEventAttachmentsSkeleton() {
  return (
    <LoadingRegion label="Loading calendar event attachments…" className="space-y-2" data-testid="attachments-skeleton">
      {[1, 2].map((i) => (
        <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
      ))}
    </LoadingRegion>
  );
}
