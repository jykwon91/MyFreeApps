export interface VoicePrivacy {
  /** Whether the learner has read the notice for how this phone recognizes speech; null while that's being read. */
  acked: boolean | null;
  ack: () => void;
}
