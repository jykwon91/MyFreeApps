import { MicOff } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { MIC_DENIED_COPY } from "@/constants/micDeniedCopy";
import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";

interface MicDeniedStateProps {
  /** The browser will tell us when access is allowed, so no reload is needed. */
  rechecks: boolean;
  onTypeInstead: () => void;
}

/** The browser refused microphone access -- explain how to fix it, offer typing. */
export default function MicDeniedState({ rechecks, onTypeInstead }: MicDeniedStateProps) {
  return (
    <EmptyState
      icon={<MicOff className="h-10 w-10" aria-hidden="true" />}
      heading={VOICE_COPY.micBlocked}
      body={rechecks ? MIC_DENIED_COPY.allow : MIC_DENIED_COPY.allowThenReload}
      action={{ label: VOICE_COPY.typeInstead, onClick: onTypeInstead }}
    />
  );
}
