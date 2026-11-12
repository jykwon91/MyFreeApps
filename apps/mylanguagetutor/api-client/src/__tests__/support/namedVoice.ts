import type { VoiceLike } from "../../types/speech/voice-like";

/** A voice the tests can tell apart by name. */
export type NamedVoice = VoiceLike & { name: string };
