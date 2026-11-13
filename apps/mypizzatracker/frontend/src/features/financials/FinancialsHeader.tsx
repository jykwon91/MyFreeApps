import type { ChildrenProps } from "@/types/ChildrenProps";

/**
 * The picker spans the header's full width under the title, at every screen
 * width. Drop names are typed by the user, so no fixed width fits them, and
 * a width taken from the options would make the real picker and its
 * placeholder lay the header out differently.
 */
export default function FinancialsHeader({ children }: ChildrenProps) {
  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">Financials</h1>
      <div className="w-full">{children}</div>
    </header>
  );
}
