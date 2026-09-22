import type { ReactNode } from "react";

interface GuideSectionProps {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}

/** One anchored section of the New Player Guide. */
export default function GuideSection({ id, title, intro, children }: GuideSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="space-y-3 scroll-mt-4">
      <h2 id={`${id}-heading`} className="text-xl font-semibold">
        {title}
      </h2>
      {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
      {children}
    </section>
  );
}
