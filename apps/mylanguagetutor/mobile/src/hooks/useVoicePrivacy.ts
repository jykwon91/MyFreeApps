import { useCallback, useEffect, useState } from "react";
import { readVoicePrivacyAck, writeVoicePrivacyAck } from "../lib/voicePrivacyAck";
import type { RecognizerPrivacy } from "../types/RecognizerPrivacy";
import type { VoicePrivacy } from "../types/VoicePrivacy";
import { privacyAckCovers } from "../utils/privacyAckCovers";

/** Whether the learner has read the privacy notice for how this phone recognizes speech, kept on the phone. */
export function useVoicePrivacy(privacy: RecognizerPrivacy | null): VoicePrivacy {
  const [read, setRead] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    void readVoicePrivacyAck().then((stored) => {
      // A notice read while this was being read wins.
      if (current) setRead((now) => (now === undefined ? stored : now));
    });
    return () => {
      current = false;
    };
  }, []);

  const ack = useCallback(() => {
    if (!privacy) return;
    setRead(privacy);
    void writeVoicePrivacyAck(privacy);
  }, [privacy]);

  return { acked: read === undefined || privacy === null ? null : privacyAckCovers(read, privacy), ack };
}
