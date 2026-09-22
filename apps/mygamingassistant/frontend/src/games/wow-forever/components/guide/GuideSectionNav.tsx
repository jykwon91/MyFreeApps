import { GUIDE_SECTIONS } from "@/games/wow-forever/components/guide/guideSections";

export default function GuideSectionNav() {
  return (
    <nav aria-label="Guide sections" className="flex flex-wrap gap-2">
      {GUIDE_SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="rounded-full border bg-card px-3 py-2 text-sm hover:bg-muted/40 transition-colors min-h-[44px] inline-flex items-center"
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
