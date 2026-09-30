import { AlertBox } from "@platform/ui";

interface CatalogErrorProps {
  onRetry: () => void;
}

export default function CatalogError({ onRetry }: CatalogErrorProps) {
  return (
    <AlertBox variant="error">
      <div className="flex items-center justify-between gap-3">
        <span>Couldn't load your lessons.</span>
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[44px] rounded-md px-3 font-medium underline"
        >
          Try again
        </button>
      </div>
    </AlertBox>
  );
}
