export interface StorageUnavailableBannerProps {
  onClose: () => void;
}

export default function StorageUnavailableBanner({
  onClose,
}: StorageUnavailableBannerProps) {
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card border rounded-lg shadow-lg px-4 py-3 text-sm max-w-sm"
    >
      <span className="flex-1">Pins won't persist (storage unavailable)</span>
      <button
        type="button"
        onClick={onClose}
        className="p-1 rounded hover:bg-muted/40 text-muted-foreground"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
