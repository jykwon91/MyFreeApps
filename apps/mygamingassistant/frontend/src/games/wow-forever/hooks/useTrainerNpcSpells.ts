import { useSyncExternalStore } from "react";
import { loadTrainerNpcSpells } from "@/games/wow-forever/lib/trainers/loadTrainerNpcSpells";
import type { TrainerNpcSpellsState } from "@/games/wow-forever/types/trainers/trainerNpcSpellsState";

let state: TrainerNpcSpellsState = { status: "loading" };
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

function load(): void {
  state = { status: "loading" };
  notify();
  loadTrainerNpcSpells().then(
    (data) => {
      state = { status: "ready", data };
      notify();
    },
    () => {
      state = { status: "error", retry: load };
      notify();
    },
  );
}

function subscribe(fn: () => void): () => void {
  if (listeners.size === 0 && state.status !== "ready") load();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot(): TrainerNpcSpellsState {
  return state;
}

/** Trainer NPC recipe lists (Classic data, cmangos). Loads once per session. */
export function useTrainerNpcSpells(): TrainerNpcSpellsState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
