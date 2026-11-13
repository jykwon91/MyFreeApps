import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import HunterPetsContent from "@/games/wow-forever/components/hunterPets/HunterPetsContent";
import HunterPetsNote from "@/games/wow-forever/components/hunterPets/HunterPetsNote";
import HunterPetsSkeleton from "@/games/wow-forever/components/hunterPets/HunterPetsSkeleton";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { HUNTER_PETS_STATUS } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useHunterPets } from "@/games/wow-forever/hooks/useHunterPets";

/** /wow-forever/hunter-pets — pet families, pet abilities with every rank, and the beasts that can be tamed. */
export default function WowHunterPetsPage() {
  useDocumentTitle("Hunter pets · WoW Forever");
  const state = useHunterPets();
  const data = state.status === HUNTER_PETS_STATUS.ready ? state.data : null;
  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader
        title="Hunter pets"
        subtitle="Pet families and their modifiers, every pet ability rank and which beasts teach it, and the beasts you can tame."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <HunterPetsNote seenCount={data ? data.beasts.filter((b) => b.seenOn !== null).length : null} />
      {state.status === HUNTER_PETS_STATUS.error ? (
        <LoadErrorRetry message="Couldn't load the hunter pets." onRetry={state.retry} retrying={false} />
      ) : null}
      {data ? <HunterPetsContent data={data} /> : null}
      {state.status === HUNTER_PETS_STATUS.loading ? <HunterPetsSkeleton /> : null}
    </div>
  );
}
