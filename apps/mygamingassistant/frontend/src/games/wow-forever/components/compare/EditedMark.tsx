interface EditedMarkProps {
  /** The game-file value, as the player would read it. */
  gameFileValue: string;
}

/** Marks a number the player changed from the game-file value (in words, not just colour). */
export default function EditedMark({ gameFileValue }: EditedMarkProps) {
  return (
    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
      Edited<span className="sr-only">, game files say {gameFileValue}</span>
    </span>
  );
}
