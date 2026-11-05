/** How to turn a copied macro into a button on your bar. */
export default function MacroHowTo() {
  return (
    <section aria-labelledby="macro-how-to" className="rounded-xl border bg-card p-4 space-y-2">
      <h2 id="macro-how-to" className="text-lg font-semibold">
        How to make a macro
      </h2>
      <ol className="list-decimal pl-5 space-y-1 text-sm">
        <li>
          Type <code className="rounded bg-muted/40 px-1">/macro</code> in chat to open the macro window.
        </li>
        <li>Choose New, and give the macro a name.</li>
        <li>Press Copy on a macro below, and paste it into the text box.</li>
        <li>Save, then drag the macro's icon onto your action bar.</li>
      </ol>
    </section>
  );
}
