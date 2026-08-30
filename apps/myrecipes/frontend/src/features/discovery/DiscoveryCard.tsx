import { Clock, Sparkles } from "lucide-react";
import { Badge } from "@platform/ui";
import DiscoveryThumbnail from "@/features/discovery/DiscoveryThumbnail";
import {
  DIFFICULTY_LABELS,
  SOURCE_COLORS,
  SOURCE_LABELS,
  formatTotalMinutes,
  hostLabel,
} from "@/features/discovery/discovery-display";
import type { DiscoveredRecipe } from "@/types/recipe/discovery";

interface Props {
  recipe: DiscoveredRecipe;
  onOpen: (recipe: DiscoveredRecipe) => void;
}

/**
 * One candidate in the discovery grid: picture, title, where it came from, and
 * the one line that says how this version differs from the others.
 *
 * A `<button>`, not a `<Link>` — opening a result costs a second Claude call
 * rather than a navigation, and there is no URL that would reproduce it. The
 * whole card is the target so the picture and the title are not two separate
 * hit areas.
 */
export default function DiscoveryCard({ recipe, onOpen }: Props) {
  const time = formatTotalMinutes(recipe.total_minutes);
  const publisher = recipe.site_name ?? hostLabel(recipe.url);

  return (
    <button
      type="button"
      onClick={() => onOpen(recipe)}
      className="group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <DiscoveryThumbnail
        path={recipe.image_url}
        alt=""
        className="aspect-[16/10] w-full"
      />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight line-clamp-2 group-hover:text-primary">
            {recipe.title}
          </h3>
          <Badge
            label={SOURCE_LABELS[recipe.source_type]}
            color={SOURCE_COLORS[recipe.source_type]}
          />
        </div>

        {publisher ? (
          <p className="text-xs text-muted-foreground">{publisher}</p>
        ) : null}

        <p className="text-sm text-muted-foreground line-clamp-2">{recipe.summary}</p>

        {recipe.why_notable ? (
          <p className="flex items-start gap-1.5 text-sm text-primary/90 line-clamp-2">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {recipe.why_notable}
          </p>
        ) : null}

        <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-muted-foreground">
          {time ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {time}
            </span>
          ) : null}
          {recipe.difficulty ? (
            <span>{DIFFICULTY_LABELS[recipe.difficulty]}</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
