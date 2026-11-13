import type { ChildrenProps } from "@/types/ChildrenProps";

/** The pickup slots' grid (a list of `li`), shared by the slot picker and its skeleton. */
export default function PickupSlotGrid({ children }: ChildrenProps) {
  return <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">{children}</ul>;
}
