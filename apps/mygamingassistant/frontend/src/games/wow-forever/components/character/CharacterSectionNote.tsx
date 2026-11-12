import type { ReactNode } from "react";

interface CharacterSectionNoteProps {
  children: ReactNode;
  testId?: string;
}

/** Why a sheet section shows no data: Blizzard didn't send it, or the character has none yet. */
export default function CharacterSectionNote({ children, testId }: CharacterSectionNoteProps) {
  return (
    <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" data-testid={testId}>
      {children}
    </p>
  );
}
