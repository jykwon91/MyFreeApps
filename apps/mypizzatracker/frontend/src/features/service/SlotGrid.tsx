import type { ChildrenProps } from "@/types/ChildrenProps";

/** The slot columns' grid, shared by the loaded dashboard and its skeleton. */
export default function SlotGrid({ children }: ChildrenProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {children}
    </div>
  );
}
