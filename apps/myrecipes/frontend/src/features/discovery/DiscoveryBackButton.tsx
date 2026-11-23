import { ArrowLeft } from "lucide-react";
import { DISCOVERY_DETAIL_COPY } from "@myrecipes/api-client/constants/discoveryDetailCopy";
import { TOUCH_TARGET } from "@/constants/touchTarget";

interface Props {
  onBack: () => void;
}

/** Back from one result to the list, whatever state its read is in. */
export default function DiscoveryBackButton({ onBack }: Props) {
  return (
    <button
      type="button"
      onClick={onBack}
      className={`inline-flex ${TOUCH_TARGET} items-center gap-1 text-sm text-muted-foreground hover:text-foreground`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {DISCOVERY_DETAIL_COPY.backToResults}
    </button>
  );
}
