import LoadingButton from "../ui/LoadingButton";
import Button from "../ui/Button";

interface Props {
  password: string;
  error: string;
  isChecking: boolean;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function TotpPasswordStep({
  password,
  error,
  isChecking,
  onPasswordChange,
  onSubmit,
  onCancel,
}: Props) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="totp-setup-password">
          Enter your password to continue
        </label>
        <input
          id="totp-setup-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          autoFocus
        />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <div className="flex gap-2">
        <LoadingButton
          type="submit"
          isLoading={isChecking}
          loadingText="Checking..."
          disabled={!password}
        >
          Continue
        </LoadingButton>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isChecking}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
