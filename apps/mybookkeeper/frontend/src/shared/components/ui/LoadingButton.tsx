import Button from "@/shared/components/ui/Button";
import Spinner from "@/shared/components/icons/Spinner";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "link";
  size?: "md" | "sm";
}

export default function LoadingButton({
  isLoading,
  loadingText,
  variant,
  size,
  children,
  disabled,
  ...props
}: Props) {
  return (
    <Button variant={variant} size={size} disabled={disabled || isLoading} {...props}>
      {isLoading ? (
        <span className="flex items-center gap-2">
          <Spinner />
          {loadingText ?? children}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
