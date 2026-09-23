import { FOREVER_NOTES } from "@/games/wow-forever/data/worldMap/foreverNotes";

/** Forever-specific travel facts that the Classic data can't know. */
export default function ForeverNotes() {
  return (
    <section aria-labelledby="wm-notes" className="rounded-xl border bg-card p-4 space-y-2">
      <h2 id="wm-notes" className="text-lg font-semibold">
        Good to know in Forever
      </h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {FOREVER_NOTES.map((note) => (
          <li key={note.id}>
            {note.text}
            {note.source && (
              <>
                {" "}
                <a href={note.source.url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                  {note.source.label}
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
