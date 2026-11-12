import { useId, useState, type FormEvent } from "react";
import { LoadingButton } from "@platform/ui";
import { CHARACTER_BAD_NAME_MESSAGE } from "@/games/wow-forever/lib/character/characterLookupProblem";
import { characterNameFromSlug, characterSlugFromName } from "@/games/wow-forever/lib/character/characterSlug";

interface CharacterLookupFormProps {
  recent: readonly string[];
  /** The character on screen, so its chip shows as current. */
  currentSlug: string | null;
  busy: boolean;
  onLookup: (slug: string) => void;
}

/** First name + surname → the character, plus one-tap chips for names looked up before. */
export default function CharacterLookupForm({ recent, currentSlug, busy, onLookup }: CharacterLookupFormProps) {
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const slug = characterSlugFromName(name);
    setInvalid(slug === null);
    if (slug !== null) {
      onLookup(slug);
      setName("");
    }
  };

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Look up a character">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label htmlFor={inputId} className="text-sm font-medium">
            Character name (first name and surname)
          </label>
          <input
            id={inputId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jason Kwon"
            autoComplete="off"
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            className="w-full min-h-[44px] rounded-md border bg-background px-3 py-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <LoadingButton type="submit" isLoading={busy} loadingText="Looking up…" className="min-h-[44px]">
          Look up
        </LoadingButton>
      </form>
      {invalid ? (
        <p id={errorId} className="text-sm text-destructive">
          {CHARACTER_BAD_NAME_MESSAGE}
        </p>
      ) : null}
      {recent.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Looked up before">
          <span className="text-xs text-muted-foreground">Looked up before:</span>
          {recent.map((slug) => (
            <button
              key={slug}
              type="button"
              onClick={() => onLookup(slug)}
              aria-pressed={slug === currentSlug}
              className="min-h-[36px] rounded-full border px-3 text-sm hover:bg-muted/40 aria-pressed:bg-muted aria-pressed:font-medium"
            >
              {characterNameFromSlug(slug)}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        US characters. Blizzard updates a character when they log out, so gear changed since then shows after your next log out.
      </p>
    </section>
  );
}
