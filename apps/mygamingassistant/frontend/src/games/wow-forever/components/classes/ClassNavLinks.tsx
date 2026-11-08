import ClassNavLink from "@/games/wow-forever/components/classes/ClassNavLink";
import { CHANGES_PATH, CHANGE_CATEGORY_PARAM, CHANGE_CLASS_PARAM } from "@/games/wow-forever/data/changes/changeFeedConfig";
import { DOWNRANK_PATH } from "@/games/wow-forever/data/downrank/downrankConfig";
import { MACRO_CLASS_PARAM } from "@/games/wow-forever/data/macros/macroClassFilter";
import { SPELLBOOK_PATH } from "@/games/wow-forever/data/spellbook/spellbookConfig";
import { WORLD_MAP_PAGE_PATH } from "@/games/wow-forever/data/worldMap/mapMarks";
import type { WowClass, WowClassId } from "@/games/wow-forever/data/classes";

interface ClassNavLinksProps {
  classId: WowClassId;
  wowClass: WowClass;
}

/** Links to per-class pages from the class hub: spellbook, talents, macros, downrank, map, changes. */
export default function ClassNavLinks({ classId, wowClass }: ClassNavLinksProps) {
  const hasDownrank = wowClass.specs.some((s) => s.role === "caster" || s.role === "healer");
  const macrosHref = `/wow-forever/macros?${new URLSearchParams({ [MACRO_CLASS_PARAM]: classId })}`;
  const changesSpellsHref = `${CHANGES_PATH}?${new URLSearchParams({ [CHANGE_CATEGORY_PARAM]: "spells", [CHANGE_CLASS_PARAM]: classId })}`;
  const changesTalentsHref = `${CHANGES_PATH}?${new URLSearchParams({ [CHANGE_CATEGORY_PARAM]: "talents", [CHANGE_CLASS_PARAM]: classId })}`;

  return (
    <section aria-labelledby="class-links-heading" className="space-y-2">
      <h2 id="class-links-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Tools for {wowClass.name}
      </h2>
      <nav aria-label={`${wowClass.name} pages`} className="flex flex-col gap-2">
        <ClassNavLink to={`${SPELLBOOK_PATH}/${classId}`} label={`${wowClass.name} spellbook`} description="All spells and ranks" />
        <ClassNavLink to={`/wow-forever/talents/${classId}`} label={`${wowClass.name} talents`} description="Plan a build, share a link" />
        <ClassNavLink to={macrosHref} label="Macros" description={`Hover-cast and other macros for ${wowClass.name}`} />
        {hasDownrank ? (
          <ClassNavLink to={DOWNRANK_PATH} label="Downrank calculator" description="Best rank per mana at your level" />
        ) : null}
        <ClassNavLink
          to={WORLD_MAP_PAGE_PATH}
          label="Find class trainers"
          description={`Search "${wowClass.name.toLowerCase()} trainer" on the World Map`}
        />
        <ClassNavLink to={changesSpellsHref} label="Spell changes vs Classic" description="Spells Forever added or changed" />
        <ClassNavLink to={changesTalentsHref} label="Talent changes vs Classic" description="Talents Forever added or changed" />
      </nav>
    </section>
  );
}
