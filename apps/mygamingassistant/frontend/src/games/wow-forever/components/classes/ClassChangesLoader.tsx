import ClassChangesSkeleton from "@/games/wow-forever/components/classes/ClassChangesSkeleton";
import ClassChangesSection from "@/games/wow-forever/components/classes/ClassChangesSection";
import { useClassChanges } from "@/games/wow-forever/hooks/useClassChanges";
import type { WowClassId } from "@/games/wow-forever/data/classes";

interface ClassChangesLoaderProps {
  classId: WowClassId;
}

/** Loads talent and spell changes for the class and renders the section or its skeleton. */
export default function ClassChangesLoader({ classId }: ClassChangesLoaderProps) {
  const state = useClassChanges(classId);
  if (state.status === "loading") {
    return <ClassChangesSkeleton />;
  }
  if (state.status === "error") {
    // Non-blocking: if changes fail to load, the rest of the page is still usable.
    return null;
  }
  return <ClassChangesSection classId={classId} data={state.data} />;
}
