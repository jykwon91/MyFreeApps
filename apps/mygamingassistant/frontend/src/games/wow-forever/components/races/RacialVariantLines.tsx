import { raceClassNames } from "@/games/wow-forever/lib/races/raceClassNames";
import type { RacialVariant } from "@/games/wow-forever/types/races/racialVariant";

/** A racial's text: one paragraph, or one indented "Warrior: …" line per class version. */
export default function RacialVariantLines({ variants }: { variants: readonly RacialVariant[] }) {
  if (variants.length === 1 && variants[0].classes === null) {
    return <p className="whitespace-pre-line">{variants[0].text}</p>;
  }
  return (
    <ul className="space-y-1">
      {variants.map((v) => (
        <li key={v.classes?.join(",") ?? "all"} className="border-l-2 pl-2">
          <span className="font-medium">{v.classes === null ? "Other classes" : raceClassNames(v.classes)}:</span>{" "}
          {v.text}
        </li>
      ))}
    </ul>
  );
}
