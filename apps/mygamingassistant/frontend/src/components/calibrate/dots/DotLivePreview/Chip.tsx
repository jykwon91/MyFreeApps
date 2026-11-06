import type { ReactNode } from "react";

interface ChipProps {
  children: ReactNode;
}

export default function Chip({ children }: ChipProps) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted/40 text-[11px] font-medium">
      {children}
    </span>
  );
}
