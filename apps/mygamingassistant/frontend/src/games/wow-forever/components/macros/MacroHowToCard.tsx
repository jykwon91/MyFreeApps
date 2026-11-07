import { MACRO_STEPS, MACRO_TIPS } from "@/games/wow-forever/data/macros/macroTemplates";

/** How to turn copied text into a button on your bar, and the tips that trip beginners up. */
export default function MacroHowToCard() {
  return (
    <section aria-labelledby="macro-how-to" className="rounded-xl border bg-card p-4 space-y-3">
      <h2 id="macro-how-to" className="text-lg font-semibold">
        How to make a macro
      </h2>
      <ol className="list-decimal pl-5 space-y-1 text-sm">
        {MACRO_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h3 className="text-sm font-semibold">Good to know</h3>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {MACRO_TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </section>
  );
}
