import type { ChildrenProps } from "@/types/ChildrenProps";

/** The service page's padded main area, shared by the loaded page and its skeleton. */
export default function ServiceFrame({ children }: ChildrenProps) {
  return <div className="p-4 sm:p-8 space-y-4 max-w-[1600px]">{children}</div>;
}
