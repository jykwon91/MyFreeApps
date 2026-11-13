import { Link } from "react-router-dom";
import type { RoundModeEmptyProps } from "@/types/roundMode/roundModeEmptyProps";

export default function RoundModeEmpty({ planModeHref }: RoundModeEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <p className="text-muted-foreground">No pins yet.</p>
      <Link
        to={planModeHref}
        className="text-sm text-primary hover:underline"
      >
        Open plan mode to pin some.
      </Link>
    </div>
  );
}
