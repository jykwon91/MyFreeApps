import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { PROFESSION_PAIRS } from "@/games/wow-forever/data/guide/professions";

export default function ProfessionsSection() {
  return (
    <GuideSection
      id="professions"
      title="Professions"
      intro="You get two main professions. First Aid, Cooking and Fishing are extra and worth learning too."
    >
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PROFESSION_PAIRS.map((p) => (
          <li key={p.pair} className="rounded-xl border bg-card p-4 space-y-1">
            <p className="text-sm font-semibold">{p.pair}</p>
            <p className="text-xs text-muted-foreground">Good for: {p.goodFor}</p>
            <p className="text-sm">{p.why}</p>
          </li>
        ))}
      </ul>
      <Link
        to="/wow-forever/professions"
        className="group flex items-center justify-between gap-2 rounded-xl border bg-card p-4 font-semibold hover:bg-muted/40 transition-colors"
      >
        Cooking & Fishing: where to train and how to level them fast
        <ArrowRight className="h-5 w-5 text-primary group-hover:translate-x-1 transition-transform" aria-hidden />
      </Link>
    </GuideSection>
  );
}
