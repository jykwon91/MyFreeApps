import ClassPageSkeleton from "@/games/wow-forever/components/classes/ClassPageSkeleton";
import ClassRacesSection from "@/games/wow-forever/components/classes/ClassRacesSection";
import { RACES_STATUS } from "@/games/wow-forever/data/races/racesConfig";
import { useRaces } from "@/games/wow-forever/hooks/useRaces";
import { racesForClass } from "@/games/wow-forever/lib/classes/classRaces";
import type { WowClassId } from "@/games/wow-forever/data/classes";

interface ClassRacesLoaderProps {
  classId: WowClassId;
}

/** Loads race data and renders the races section or its skeleton. */
export default function ClassRacesLoader({ classId }: ClassRacesLoaderProps) {
  const state = useRaces();
  if (state.status === RACES_STATUS.loading) {
    return <ClassPageSkeleton />;
  }
  if (state.status === RACES_STATUS.error) {
    return null;
  }
  const races = racesForClass(classId, state.data.races);
  return <ClassRacesSection races={races} />;
}
