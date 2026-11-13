import type { ChildrenProps } from "@/types/ChildrenProps";

/** The order cards' column under the drop header, shared by the order builder and its skeleton. */
export default function OrderStack({ children }: ChildrenProps) {
  return <div className="space-y-4">{children}</div>;
}
