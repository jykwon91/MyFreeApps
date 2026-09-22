import GuideSection from "@/games/wow-forever/components/guide/GuideSection";
import { DUNGEON_BASICS } from "@/games/wow-forever/data/guide/dungeonBasics";

export default function DungeonBasicsSection() {
  return (
    <GuideSection id="dungeons" title="Dungeon basics" intro="What to know before your first group run.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {DUNGEON_BASICS.map((topic) => (
          <article key={topic.title} className="rounded-xl border bg-card p-4 space-y-2">
            <h3 className="text-base font-semibold">{topic.title}</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {topic.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </GuideSection>
  );
}
