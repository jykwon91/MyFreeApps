import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export interface BackButtonProps {
  gameSlug: string;
  navigate: ReturnType<typeof useNavigate>;
}

export default function BackButton({ gameSlug, navigate }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={() => navigate(`/${gameSlug}`)}
      className="p-2 rounded-md hover:bg-muted/40 transition-colors min-h-[44px]"
      aria-label="Back to maps"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}
