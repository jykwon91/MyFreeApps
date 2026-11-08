import ClassCard from "@/games/wow-forever/components/classes/ClassCard";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { WOW_CLASSES } from "@/games/wow-forever/data/classes";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import type { ClassDetailsFile } from "@/games/wow-forever/types/classes/classDetailsFile";
import classDetailsRaw from "@/games/wow-forever/data/classes/classDetails.json";

const CLASS_DETAILS = (classDetailsRaw as unknown as ClassDetailsFile).classes;

/** /wow-forever/classes — the nine playable classes with their icon, name and roles. */
export default function WowClassesPage() {
  useDocumentTitle("Classes · WoW Forever");
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
      <WowPageHeader
        title="Classes"
        subtitle="Pick a class to see its races, spellbook, talents, macros and what Forever changed."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <section aria-label="All classes">
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {WOW_CLASSES.map((wowClass) => {
            const detail = CLASS_DETAILS[wowClass.id];
            if (!detail) return null;
            return (
              <li key={wowClass.id}>
                <ClassCard wowClass={wowClass} detail={detail} />
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
