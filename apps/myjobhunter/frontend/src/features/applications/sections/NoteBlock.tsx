interface NoteBlockProps {
  note: string | null;
}

export default function NoteBlock({ note }: NoteBlockProps) {
  if (!note) return null;
  return <p className="text-sm mt-2 whitespace-pre-wrap">{note}</p>;
}
