import { TurnstileWidget } from "@platform/ui";

interface TurnstileFieldProps {
  /** Bump to remount the widget for a fresh single-use token. */
  resetKey: number;
  expired: boolean;
  onVerify: (token: string) => void;
  onExpire: () => void;
  /** Get a new token after the last one expired. */
  onRetry: () => void;
}

/**
 * Cloudflare's quick human check for a public call that spends API money (the
 * screenshot reader, "Suggest a feature"). Renders nothing without a site key.
 */
export default function TurnstileField({ resetKey, expired, onVerify, onExpire, onRetry }: TurnstileFieldProps) {
  return (
    <div className="space-y-1">
      <TurnstileWidget key={resetKey} onVerify={onVerify} onExpire={onExpire} />
      {expired ? (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[44px] text-sm text-primary underline underline-offset-2"
        >
          Verification expired. Tap to retry
        </button>
      ) : null}
    </div>
  );
}
