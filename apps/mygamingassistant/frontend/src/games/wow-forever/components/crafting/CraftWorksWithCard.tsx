import type { CraftingFeatures } from "@/games/wow-forever/types/crafting";

interface CraftWorksWithCardProps {
  worksWith: NonNullable<CraftingFeatures["worksWith"]>;
}

/** "Works well with Herbalism" — the gathering profession that feeds this one. Text only. */
export default function CraftWorksWithCard({ worksWith }: CraftWorksWithCardProps) {
  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4" data-testid="works-well-with">
      <p className="font-semibold">Works well with {worksWith.name}</p>
      <p className="text-sm text-muted-foreground">{worksWith.why}</p>
    </div>
  );
}
