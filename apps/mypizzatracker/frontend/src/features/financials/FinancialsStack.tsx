import type { ChildrenProps } from "@/types/ChildrenProps";

/** The financials sections' column, shared by the loaded body and its skeleton. */
export default function FinancialsStack({ children }: ChildrenProps) {
  return <div className="space-y-4">{children}</div>;
}
