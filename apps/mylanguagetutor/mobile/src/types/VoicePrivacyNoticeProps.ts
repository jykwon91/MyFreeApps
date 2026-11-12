import type { RecognizerPrivacy } from "./RecognizerPrivacy";

export interface VoicePrivacyNoticeProps {
  privacy: RecognizerPrivacy;
  onContinue: () => void;
  onTypeInstead: () => void;
}
