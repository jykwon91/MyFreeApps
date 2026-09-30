import { GUIDE_SECTIONS } from "@/games/wow-forever/components/guide/guideSections";

interface GuideSectionNavProps {
  sections?: readonly { id: string; label: string }[];
}

export default function GuideSectionNav({ sections = GUIDE_SECTIONS }: GuideSectionNavProps) {
  return (
    <nav aria-label="Page sections" className="flex flex-wrap gap-2">
      {sections.map((s) => (
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
