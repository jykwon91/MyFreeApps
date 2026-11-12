import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useGetCharacterQuery } from "@/games/wow-forever/api/wowCharacterApi";
import CharacterLookupForm from "@/games/wow-forever/components/character/CharacterLookupForm";
import CharacterSheet from "@/games/wow-forever/components/character/CharacterSheet";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useRecentCharacters } from "@/games/wow-forever/hooks/useRecentCharacters";
import { characterSlugFromName } from "@/games/wow-forever/lib/character/characterSlug";

const PAGE_PATH = "/wow-forever/character";

/** /wow-forever/character[/:slug] — your character's picture and gear, from Blizzard, by name. */
export default function WowCharacterPage() {
  useDocumentTitle("Your character · WoW Forever");
  const { slug: rawSlug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [recent, remember] = useRecentCharacters();
  const slug = rawSlug ? characterSlugFromName(rawSlug) : null;
  const { data, error, isFetching } = useGetCharacterQuery(slug ?? "", { skip: slug === null });
  const shown = data && data.slug === slug ? data : undefined;

  // Remembered only once Blizzard knows the name, so a typo never becomes a chip.
  useEffect(() => {
    if (shown) remember(shown.slug);
  }, [shown, remember]);

  if (!rawSlug && recent.length > 0) return <Navigate to={`${PAGE_PATH}/${recent[0]}`} replace />;

  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-5xl">
      <WowPageHeader
        title="Your character"
        subtitle="Your character's look and gear, with the stats each item rolled — straight from Blizzard, no login."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <CharacterLookupForm
        recent={recent}
        currentSlug={slug}
        busy={isFetching}
        onLookup={(next) => navigate(`${PAGE_PATH}/${next}`)}
      />
      <CharacterSheet slug={slug} rawSlug={rawSlug} shown={shown} error={error} isFetching={isFetching} />
    </main>
  );
}
