import { ArrowLeft, Clock, ExternalLink, Lightbulb, MessagesSquare, Users } from "lucide-react";
import { Badge, Button } from "@platform/ui";
import DiscoveryThumbnail from "@/features/discovery/DiscoveryThumbnail";
import {
  SOURCE_COLORS,
  SOURCE_LABELS,
  hostLabel,
} from "@/features/discovery/discovery-display";
import { formatIngredientLine } from "@/features/recipes/IngredientLine";
import type { DiscoveredDetail } from "@/types/recipe/discovery";

interface Props {
  detail: DiscoveredDetail;
  onBack: () => void;
  onSave: () => void;
}

/**
 * The full read of one discovered recipe: what it is, why it's worth cooking,
 * and the recipe itself — before any of it is saved.
 *
 * This is a reading view, not an editor. "Save to my recipes" hands the draft
 * to the ordinary recipe editor, which is where the user corrects whatever the
 * page got wrong. Keeping the two apart means the common case (read it, decide
 * against it) never puts a form in front of anyone.
 *
 * Every link out carries rel="noopener noreferrer" and opens in a new tab:
 * these URLs came off the open web, and the reader should keep their place in
 * the results either way.
 */
export default function DiscoveryDetailView({ detail, onBack, onSave }: Props) {
  const publisher = detail.site_name ?? hostLabel(detail.url);
  const { draft } = detail;
  const hasMeta =
    draft.servings !== null || draft.prep_minutes !== null || draft.cook_minutes !== null;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to results
      </button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                label={SOURCE_LABELS[detail.source_type]}
                color={SOURCE_COLORS[detail.source_type]}
              />
              {publisher ? (
                <span className="text-sm text-muted-foreground">{publisher}</span>
              ) : null}
            </div>
            <h1 className="text-2xl font-semibold leading-tight">{detail.title}</h1>
            {detail.summary ? (
              <p className="text-muted-foreground">{detail.summary}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={onSave}>Save to my recipes</Button>
              <a
                href={detail.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary underline underline-offset-2"
              >
                View original
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </header>

          {hasMeta ? (
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {draft.servings !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  {draft.servings}
                </span>
              ) : null}
              {draft.prep_minutes !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  {draft.prep_minutes} min prep
                </span>
              ) : null}
              {draft.cook_minutes !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  {draft.cook_minutes} min cook
                </span>
              ) : null}
            </div>
          ) : null}

          <section className="rounded-lg border bg-card p-6">
            <h2 className="mb-3 text-base font-medium">Ingredients</h2>
            {draft.ingredients.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                This page didn&apos;t list ingredients we could read — open the
                original to check.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {draft.ingredients.map((ingredient, idx) => (
                  <li key={idx} className="flex gap-2 text-sm">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span>{formatIngredientLine(ingredient)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-card p-6">
            <h2 className="mb-3 text-base font-medium">Steps</h2>
            {draft.steps.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                No steps we could read — open the original.
              </p>
            ) : (
              <ol className="space-y-3">
                {draft.steps.map((step, idx) => (
                  <li key={idx} className="flex gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {idx + 1}
                    </span>
                    <span className="pt-0.5">{step.instruction}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <DiscoveryThumbnail
            path={detail.image_url}
            alt=""
            className="aspect-[4/3] w-full rounded-lg border"
          />

          {detail.tips.length > 0 ? (
            <section className="rounded-lg border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-base font-medium">
                <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />
                Tips from the source
              </h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {detail.tips.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.community_notes.length > 0 ? (
            <section className="rounded-lg border bg-card p-5">
              <h2 className="mb-3 flex items-center gap-2 text-base font-medium">
                <MessagesSquare className="h-4 w-4 text-primary" aria-hidden="true" />
                What cooks report
              </h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {detail.community_notes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {detail.sources.length > 0 ? (
            <section className="space-y-2 text-xs text-muted-foreground">
              <h2 className="font-medium text-foreground">Read from</h2>
              <ul className="space-y-1">
                {detail.sources.map((source) => (
                  <li key={source} className="truncate">
                    <a
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      {hostLabel(source) || source}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
