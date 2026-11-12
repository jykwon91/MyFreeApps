import CharacterProfessionCard from "@/games/wow-forever/components/character/CharacterProfessionCard";
import type { CharacterProfession } from "@/games/wow-forever/types/character/characterProfession";

interface CharacterProfessionGroupProps {
  label: string;
  professions: readonly CharacterProfession[];
  /** The open profession's id, or null. */
  open: number | null;
  onToggle: (professionId: number) => void;
}

/** "Main professions" or "Secondary": a heading and one card per profession. Hidden when the character has none. */
export default function CharacterProfessionGroup({ label, professions, open, onToggle }: CharacterProfessionGroupProps) {
  if (professions.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{label}</h3>
      {professions.map((profession) => (
        <CharacterProfessionCard
          key={profession.id}
          profession={profession}
          open={open === profession.id}
          onToggle={() => onToggle(profession.id)}
        />
      ))}
    </div>
  );
}
