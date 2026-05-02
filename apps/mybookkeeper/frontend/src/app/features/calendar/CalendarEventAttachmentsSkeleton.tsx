export default function CalendarEventAttachmentsSkeleton() {
  return (
    <div className="space-y-2" data-testid="attachments-skeleton">
      {[1, 2].map((i) => (
        <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
      ))}
    </div>
  );
}
