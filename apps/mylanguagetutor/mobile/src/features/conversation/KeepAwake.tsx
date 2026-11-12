import { useKeepAwake } from "expo-keep-awake";

/** Keeps the screen from sleeping while it's rendered. */
export default function KeepAwake() {
  useKeepAwake();
  return null;
}
