import type { ReactNode } from "react";
import ItemSourceNote from "@/games/wow-forever/components/itemPages/ItemSourceNote";

interface ItemSourceSectionProps {
  title: string;
  /** Where the section's facts come from. */
  label: string;
  children: ReactNode;
}

/** One way to get the item: a heading, its source label, its rows. */
export default function ItemSourceSection({ title, label, children }: ItemSourceSectionProps) {
  return (
    <section className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <ItemSourceNote label={label} />
      </div>
      {children}
    </section>
  );
}
