import { BETA_LEVEL_CAP, levelCap, MAX_LEVEL } from "@/games/wow-forever/data/levelCap";

/** Under a level field before launch: why it stops at 30. Nothing after launch. */
export default function LevelCapNote() {
  if (levelCap() >= MAX_LEVEL) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Stops at level {BETA_LEVEL_CAP} until launch — {MAX_LEVEL} from Nov 4.
    </p>
  );
}
