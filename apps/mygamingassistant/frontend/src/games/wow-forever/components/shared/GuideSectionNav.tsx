interface GuideSectionNavProps {
  sections: readonly { id: string; label: string }[];
}

/** Jump-link strip rendered at the top of Gold, Professions and similar WoW Forever pages. */
export default function GuideSectionNav({ sections }: GuideSectionNavProps) {
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
