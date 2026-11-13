import {
  HUNTER_PETS_SKELETON_FAMILIES,
  HUNTER_PETS_SKELETON_ROWS,
} from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";

const BAR = "rounded bg-muted animate-pulse";

/** Same shape as the loaded page: the family cards, the abilities, then the filters and beast rows. */
export default function HunterPetsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading hunter pets" data-testid="hunter-pets-skeleton">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-hidden>
        {Array.from({ length: HUNTER_PETS_SKELETON_FAMILIES }, (_, i) => (
          <li key={i} className={`h-24 rounded-xl border bg-card ${BAR}`} />
        ))}
      </ul>
      <div className="space-y-3" aria-hidden>
        <div className={`h-7 w-40 ${BAR}`} />
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-card p-3 sm:p-4">
            <div className={`h-6 w-1/3 ${BAR}`} />
            <div className={`h-16 w-full ${BAR}`} />
          </div>
        ))}
      </div>
      <div className="space-y-3" aria-hidden>
        <div className={`h-7 w-48 ${BAR}`} />
        <div className={`h-11 w-full ${BAR}`} />
        <ul className="space-y-2">
          {Array.from({ length: HUNTER_PETS_SKELETON_ROWS }, (_, i) => (
            <li key={i} className={`h-16 rounded-xl border bg-card ${BAR}`} data-testid="hunter-pets-skeleton-row" />
          ))}
        </ul>
      </div>
    </div>
  );
}
