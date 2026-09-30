import { MicOff } from "lucide-react";
import { EmptyState } from "@platform/ui";

interface MicDeniedStateProps {
  onTypeInstead: () => void;
}

/** The browser refused microphone access -- explain how to fix it, offer typing. */
export default function MicDeniedState({ onTypeInstead }: MicDeniedStateProps) {
  return (
    <EmptyState
      icon={<MicOff className="h-10 w-10" aria-hidden="true" />}
      heading="Microphone is blocked"
      body="To practice speaking, allow microphone access for this site in your browser's address bar, then reload. You can keep practicing by typing in the meantime."
      action={{ label: "Type instead", onClick: onTypeInstead }}
    />
  );
}
