import { inlineSpans } from "@myjobhunter/api-client/utils/inlineSpans";

// Renders one line of the constrained markdown subset (**bold**, *italic*, plain runs) as inline
// spans. The parsing is shared with the phone.
export default function InlineText({ source }: { source: string }) {
  const spans = inlineSpans(source);
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
