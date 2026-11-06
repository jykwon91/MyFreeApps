/** A dashed placeholder card: nothing entered yet, or nothing fits. */
export default function EmptyStateNote({ message }: { message: string }) {
  return <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">{message}</p>;
}
