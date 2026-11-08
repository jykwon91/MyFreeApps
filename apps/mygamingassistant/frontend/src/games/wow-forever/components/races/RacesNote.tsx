import ProvenanceBadge from "@/games/wow-forever/components/shared/ProvenanceBadge";
import { RACES_TEXT } from "@/games/wow-forever/data/races/racesConfig";
import { PROVENANCE } from "@/games/wow-forever/types/provenance/provenance";

/** Where the races and racials come from, what each status means, and what "?" is. */
export default function RacesNote() {
  return (
    <details className="rounded-xl border bg-card p-3 text-sm sm:p-4" data-testid="races-note">
      <summary className="min-h-[44px] cursor-pointer content-center font-medium">Where this comes from</summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p>
          Races, their classes and every racial's name and text are read from the Forever game files{" "}
          <ProvenanceBadge provenance={PROVENANCE.client} />. Each racial is compared with the same racial in the Classic
          Era game files: “New in Forever”, “Changed in Forever” (both texts side by side), “Same as Classic” or “Removed in
          Forever”.
        </p>
        <p>
          Classic texts and Classic starting zones are Classic data <ProvenanceBadge provenance={PROVENANCE.classic} />.
          The Skyborne races aren't in Classic, so where they start is marked{" "}
          <ProvenanceBadge provenance={PROVENANCE.unconfirmed} />.
        </p>
        <p>{RACES_TEXT.unknownValue}</p>
      </div>
    </details>
  );
}
