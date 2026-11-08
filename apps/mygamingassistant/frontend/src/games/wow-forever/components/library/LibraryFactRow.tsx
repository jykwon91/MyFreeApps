import type { ReactNode } from "react";

interface LibraryFactRowProps {
  label: string;
  children: ReactNode;
}

/** A label and its value, side by side from `sm`, stacked on a phone. */
export default function LibraryFactRow({ label, children }: LibraryFactRowProps) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2">{children}</dd>
    </div>
  );
}
