/**
 * Where the conversation loop is right now.
 * - ``idle``: ready for the learner
 * - ``listening``: the microphone is open (interim transcript showing)
 * - ``waiting``: the turn is sent; the tutor hasn't answered yet (typing dots)
 * - ``replying``: the reply is streaming in
 * - ``speaking``: the reply is finished and is being read aloud
 */
export type VoicePhase = "idle" | "listening" | "waiting" | "replying" | "speaking";
