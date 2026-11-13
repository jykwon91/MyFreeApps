import { useEffect } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useGetCharacterQuery } from "@/games/wow-forever/api/wowCharacterApi";
import CharacterLookupForm from "@/games/wow-forever/components/character/CharacterLookupForm";
import CharacterSheet from "@/games/wow-forever/components/character/CharacterSheet";
import { CHARACTER_DEFAULT_BACK, CHARACTER_PAGE_PATH } from "@/games/wow-forever/data/character/characterConfig";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useRecentCharacters } from "@/games/wow-forever/hooks/useRecentCharacters";
import { characterSlugFromName } from "@/games/wow-forever/lib/character/characterSlug";
import { parseBackLink } from "@/games/wow-forever/lib/shared/backLinkState";

/** /wow-forever/character[/:slug] — your character's picture and gear, from Blizzard, by name. */
export default function WowCharacterPage() {
  useDocumentTitle("Your character · WoW Forever");
  const { slug: rawSlug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  // Kept through a lookup so the back arrow still returns to wherever the visitor came from (the guild page).
  const cameFrom = parseBackLink(useLocation().state);
  const back = cameFrom ?? CHARACTER_DEFAULT_BACK;
  const [recent, remember] = useRecentCharacters();
  const slug = rawSlug ? characterSlugFromName(rawSlug) : null;
  const { data, error, isFetching } = useGetCharacterQuery(slug ?? "", { skip: slug === null });
  const shown = data && data.slug === slug ? data : undefined;

  // Remembered only once Blizzard knows the name, so a typo never becomes a chip.
  useEffect(() => {
    if (shown) remember(shown.slug);
  }, [shown, remember]);

  if (!rawSlug && recent.length > 0) return <Navigate to={`${CHARACTER_PAGE_PATH}/${recent[0]}`} state={cameFrom ?? undefined} replace />;

  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-5xl">
      <WowPageHeader
        title="Your character"
        subtitle="Your character's look and gear, with the stats each item rolled — straight from Blizzard, no login."
        backTo={back.backTo}
        backLabel={back.backLabel}
      />
      <CharacterLookupForm
        recent={recent}
        currentSlug={slug}
        busy={isFetching}
        onLookup={(next) => navigate(`${CHARACTER_PAGE_PATH}/${next}`, { state: cameFrom ?? undefined })}
      />
      <CharacterSheet slug={slug} rawSlug={rawSlug} shown={shown} error={error} isFetching={isFetching} />
    </div>
  );
}
