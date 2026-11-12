import type { ComposerView } from "../types/session/composer-view";
import type { ComposerViewInputs } from "../types/session/composer-view-inputs";

/** Which one thing the bottom of the practice screen shows. A block wins; typing needs no notice. */
export function composerView({ blocked, mode, failure, privacyAcked }: ComposerViewInputs): ComposerView {
  if (blocked) return "blocked";
  if (mode === "text") return "text";
  if (failure === "denied") return "denied";
  if (!privacyAcked) return "privacy";
  return "voice";
}
