import { BETA_LEVEL_CAP, levelCap, MAX_LEVEL } from "@/games/wow-forever/data/levelCap";

/** Under a level field while the beta caps levels: why it stops at 30. Nothing after launch. */
export default function LevelCapNote() {
  if (levelCap() >= MAX_LEVEL) return null;
  return (
    <p className="text-xs text-muted-foreground">
      The beta stops at level {BETA_LEVEL_CAP} — {MAX_LEVEL} from launch on Nov 4.
    </p>
  );
}
