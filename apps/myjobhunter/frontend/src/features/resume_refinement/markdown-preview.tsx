// Tiny in-page markdown preview. Handles only the constrained subset
// emitted by the backend's render/rewrite pipeline (headings, bullet
// lists, **bold**, *italic*, paragraphs). For the canonical rendering
// users export to PDF / DOCX which uses pandoc + weasyprint.

interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

interface MarkdownPreviewProps {
  source: string;
}

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

function InlineText({ source }: { source: string }) {
  const spans = renderInline(source);
  return (
    <>
      {spans.map((span, idx) => {
        const node = <span key={idx}>{span.text}</span>;
        if (span.bold && span.italic) return <strong key={idx}><em>{span.text}</em></strong>;
        if (span.bold) return <strong key={idx}>{span.text}</strong>;
        if (span.italic) return <em key={idx}>{span.text}</em>;
        return node;
      })}
    </>
  );
}

export default function MarkdownPreview({ source }: MarkdownPreviewProps) {
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  function flushList() {
    if (listBuffer.length > 0) {
      const items = [...listBuffer];
      blocks.push(
        <ul key={`ul-${key++}`} className="list-disc pl-5 space-y-1 text-sm">
          {items.map((item, idx) => (
            <li key={idx}>
              <InlineText source={item} />
            </li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    if (line.startsWith("- ")) {
      listBuffer.push(line.slice(2));
      continue;
    }

    flushList();

    if (!line) {
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(
        <h1 key={`h-${key++}`} className="text-xl font-bold border-b border-border pb-1">
          <InlineText source={line.slice(2)} />
        </h1>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={`h-${key++}`} className="text-base font-bold uppercase tracking-wide mt-4">
          <InlineText source={line.slice(3)} />
        </h2>
      );
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={`h-${key++}`} className="text-sm font-bold mt-2">
          <InlineText source={line.slice(4)} />
        </h3>
      );
      continue;
    }
    blocks.push(
      <p key={`p-${key++}`} className="text-sm">
        <InlineText source={line} />
      </p>
    );
  }
  flushList();

  return <div className="space-y-1.5">{blocks}</div>;
}
