interface SectionDividerProps {
  section: string;
}

// Thin labeled divider marking transitions between target sections so
// the transcript reads as grouped chapters.
export default function SectionDivider({ section }: SectionDividerProps) {
  return (
    <li role="presentation" aria-hidden="true" className="flex items-center gap-2 py-1">
      <span className="flex-1 h-px bg-border" />
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium shrink-0">
        {section}
      </span>
      <span className="flex-1 h-px bg-border" />
    </li>
  );
}
