import type { ChildrenProps } from "@/types/ChildrenProps";

/** A bordered card section of the financials page, shared by the loaded sections and their skeletons. */
export default function FinancialsSection({ children }: ChildrenProps) {
  return <section className="rounded-lg border bg-card p-4 space-y-3">{children}</section>;
}
