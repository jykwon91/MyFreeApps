import { Link } from "react-router-dom";
import type { CharacterCalculatorLink } from "@/games/wow-forever/types/character/characterCalculatorLink";

/** Opens the set in the talent calculator, or says why it can't (nothing when there's simply nothing to show). */
export default function CharacterTalentsCalculatorLink({ link }: { link: CharacterCalculatorLink }) {
  if (link.kind === "link") {
    return (
      <Link
        to={link.href}
        className="inline-flex min-h-[44px] items-center rounded-md border px-3 text-sm font-medium hover:bg-muted sm:ml-auto"
        data-testid="character-talents-calculator-link"
      >
        Open in the talent calculator
      </Link>
    );
  }
  return (
    link.reason && (
      <p className="text-xs text-muted-foreground sm:ml-auto" data-testid="character-talents-no-link">
        {link.reason}
      </p>
    )
  );
}
