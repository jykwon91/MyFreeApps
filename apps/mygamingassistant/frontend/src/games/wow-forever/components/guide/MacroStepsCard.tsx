import { MACRO_STEPS, MACRO_TIPS } from "@/games/wow-forever/data/guide/macroTemplates";

/** How to turn copied text into a button on your bar, and the tips that trip beginners up. */
export default function MacroStepsCard() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <h3 className="text-base font-semibold">How to make a macro</h3>
      <ol className="list-decimal pl-5 space-y-1 text-sm">
        {MACRO_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h4 className="text-sm font-semibold">Good to know</h4>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {MACRO_TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </div>
  );
}
