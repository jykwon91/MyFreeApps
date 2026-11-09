import { ArrowLeft } from "lucide-react";

interface BackToMaterialsButtonProps {
  professionLabel: string;
  onClick: () => void;
}

/** Leaves the recipe for the profession's materials list. */
export default function BackToMaterialsButton({ professionLabel, onClick }: BackToMaterialsButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center gap-1 rounded-md text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary"
      data-testid="recipe-back"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      All {professionLabel} materials
    </button>
  );
}
