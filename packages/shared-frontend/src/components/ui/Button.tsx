import { cn } from "@/shared/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "destructive" | "link";
type Size = "md" | "sm";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const isBlock = (v: Variant) => v === "primary" || v === "secondary";

export default function Button({ variant = "primary", size = "md", className, ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:opacity-90",
        variant === "secondary" && "border hover:bg-muted",
        variant === "ghost" && "text-muted-foreground hover:underline px-2",
        variant === "destructive" && "text-destructive hover:underline",
        variant === "link" && "text-primary hover:underline",
        isBlock(variant) && size === "md" && "rounded-md px-4 py-2 text-sm min-h-[44px]",
        isBlock(variant) && size === "sm" && "rounded px-3 py-1.5 text-xs min-h-[44px] sm:min-h-[32px]",
        !isBlock(variant) && size === "md" && "text-sm",
        !isBlock(variant) && size === "sm" && "text-xs",
        className,
      )}
      {...props}
    />
  );
}
