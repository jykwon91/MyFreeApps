import { AlertBox } from "@platform/ui";
import CopyButton from "@/games/wow-forever/components/worldMap/CopyButton";
import type { HowToStep } from "@/games/wow-forever/data/professions/professionTypes";

/** Numbered steps, with the fix for each common snag right under the step it happens in. */
export default function HowToSteps({ steps }: { steps: readonly HowToStep[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((step, i) => (
        <li key={step.id} className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
            {i + 1}
          </span>
          <div className="space-y-1.5 min-w-0">
            <p className="font-semibold">{step.title}</p>
            <p className="text-sm">{step.detail}</p>
            {step.stuck ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Stuck? </span>
                {step.stuck}
              </p>
            ) : null}
            {step.command ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 text-sm">{step.command}</code>
                <CopyButton text={step.command} label="Copy" />
              </div>
            ) : null}
            {step.warning ? <AlertBox variant="warning">{step.warning}</AlertBox> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
