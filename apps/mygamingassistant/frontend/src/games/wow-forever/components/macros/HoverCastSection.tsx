import MacroTemplateBuilder from "@/games/wow-forever/components/macros/MacroTemplateBuilder";

/** The page's headline: what hover casting is, and a builder for any spell. */
export default function HoverCastSection() {
  return (
    <section id="hover-cast" aria-labelledby="hover-cast-heading" className="space-y-3 scroll-mt-4">
      <h2 id="hover-cast-heading" className="text-lg font-semibold">
        Hover-cast macros (mouseover)
      </h2>
      <p className="text-sm text-muted-foreground">
        A hover-cast macro casts on whoever your mouse is over, without changing your target.
      </p>
      <MacroTemplateBuilder />
    </section>
  );
}
