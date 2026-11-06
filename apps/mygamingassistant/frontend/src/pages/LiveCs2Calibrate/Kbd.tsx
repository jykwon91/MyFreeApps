import type { ReactNode } from "react";

interface KbdProps {
  children: ReactNode;
}

export default function Kbd({ children }: KbdProps) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border bg-muted/30 text-[10px] font-mono">
      {children}
    </kbd>
  );
}
