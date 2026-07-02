interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

// Renders one line of the constrained markdown subset (**bold**,
// *italic*, plain runs) as inline spans. Split out of markdown-preview
// so each file owns exactly one component.
function renderInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let i = 0;
  let buffer = "";

  while (i < line.length) {
    if (line[i] === "*" && line[i + 1] === "*") {
      const end = line.indexOf("**", i + 2);
      if (end >= 0) {
        if (buffer) {
          spans.push({ text: buffer });
          buffer = "";
        }
        spans.push({ text: line.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    } else if (line[i] === "*") {
      const end = line.indexOf("*", i + 1);
      if (end >= 0 && line[end + 1] !== "*") {
        if (buffer) {
          spans.push({ text: buffer });
          buffer = "";
        }
        spans.push({ text: line.slice(i + 1, end), italic: true });
        i = end + 1;
        continue;
      }
    }
    buffer += line[i];
    i += 1;
  }

  if (buffer) {
    spans.push({ text: buffer });
  }
  return spans;
}

export default function InlineText({ source }: { source: string }) {
  const spans = renderInline(source);
  return (
    <>
      {spans.map((span, idx) => {
        if (span.bold && span.italic) return <strong key={idx}><em>{span.text}</em></strong>;
        if (span.bold) return <strong key={idx}>{span.text}</strong>;
        if (span.italic) return <em key={idx}>{span.text}</em>;
        return <span key={idx}>{span.text}</span>;
      })}
    </>
  );
}
