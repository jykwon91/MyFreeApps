import { Button } from "@platform/ui";
import { Sparkles } from "lucide-react";
import type { WelcomeBackProps } from "@/types/public/WelcomeBackProps";

export default function WelcomeBack({ name, theUsualCount, applied, onApply }: WelcomeBackProps) {
  return (
    <div className="rounded border border-primary/40 bg-primary/5 px-3 py-2 flex items-start gap-3">
      <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium">Welcome back, {name}!</p>
        {applied ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            Your usual order has been loaded -- adjust the pizzas below as needed.
          </p>
        ) : theUsualCount > 0 ? (
          <>
            <p className="text-xs text-muted-foreground mt-0.5">
              Want to order your usual? We can fill in your last order's{" "}
              {theUsualCount === 1 ? "pizza" : `${theUsualCount} pizzas`} for you.
            </p>
            <Button
              size="sm"
              className="mt-2"
              onClick={onApply}
              aria-label="Order the usual"
            >
              Order the usual
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">
            (Your previous picks aren't on the current menu -- pick fresh below.)
          </p>
        )}
      </div>
    </div>
  );
}
