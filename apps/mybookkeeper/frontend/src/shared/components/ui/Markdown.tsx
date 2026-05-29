/**
 * Markdown renderer — wraps react-markdown with safe defaults for
 * operator-authored content displayed on public pages.
 *
 * Safety decisions (see PR description for full rationale):
 *  - No rehype-raw: raw HTML in markdown source is escaped, never injected.
 *  - Images disabled: arbitrary external image URLs are a privacy/tracking
 *    vector on the public apply page. Images are rendered as nothing.
 *  - Links: rendered with rel="noopener noreferrer" + target="_blank".
 *    react-markdown's default urlTransform strips javascript: and data: URIs.
 *  - remark-gfm enabled for tables, strikethrough, and autolinks.
 *
 * Promote to @platform/ui when a second app needs markdown rendering.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { ExtraProps } from "react-markdown";

interface MarkdownProps {
  /** Raw markdown source string. Renders nothing when empty or undefined. */
  content: string | null | undefined;
  /** Additional className applied to the outer wrapper div. */
  className?: string;
}

/**
 * Allowed link protocols. react-markdown's default urlTransform already strips
 * javascript: and data: — this list is explicit documentation of intent.
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function isSafeUrl(href: string | undefined): boolean {
  if (!href) return false;
  try {
    const url = new URL(href, window.location.href);
    // Allowlist only — anything not http/https/mailto (javascript:, data:,
    // vbscript:, file:, ...) is rejected. A blocklist here would always be
    // incomplete (CodeQL js/incomplete-url-sanitization).
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    // Unparseable URL — fail closed.
    return false;
  }
}

const COMPONENTS: Components = {
  // Headings — scale down one level so h1 in markdown doesn't overpower the page.
  h1: ({ children, ...props }: React.ComponentPropsWithoutRef<"h2"> & ExtraProps) => (
    <h2 className="text-base font-semibold mt-4 mb-1 text-foreground" {...props}>
      {children}
    </h2>
  ),
  h2: ({ children, ...props }: React.ComponentPropsWithoutRef<"h3"> & ExtraProps) => (
    <h3 className="text-sm font-semibold mt-3 mb-1 text-foreground" {...props}>
      {children}
    </h3>
  ),
  h3: ({ children, ...props }: React.ComponentPropsWithoutRef<"h4"> & ExtraProps) => (
    <h4 className="text-sm font-medium mt-2 mb-1 text-foreground" {...props}>
      {children}
    </h4>
  ),
  // Paragraph
  p: ({ children, ...props }: React.ComponentPropsWithoutRef<"p"> & ExtraProps) => (
    <p className="text-sm text-foreground mb-2 last:mb-0" {...props}>
      {children}
    </p>
  ),
  // Bold / italic
  strong: ({ children, ...props }: React.ComponentPropsWithoutRef<"strong"> & ExtraProps) => (
    <strong className="font-semibold" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: React.ComponentPropsWithoutRef<"em"> & ExtraProps) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  // Unordered list
  ul: ({ children, ...props }: React.ComponentPropsWithoutRef<"ul"> & ExtraProps) => (
    <ul className="list-disc list-inside text-sm text-foreground mb-2 space-y-0.5" {...props}>
      {children}
    </ul>
  ),
  // Ordered list
  ol: ({ children, ...props }: React.ComponentPropsWithoutRef<"ol"> & ExtraProps) => (
    <ol className="list-decimal list-inside text-sm text-foreground mb-2 space-y-0.5" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: React.ComponentPropsWithoutRef<"li"> & ExtraProps) => (
    <li className="text-sm text-foreground" {...props}>
      {children}
    </li>
  ),
  // Blockquote
  blockquote: ({ children, ...props }: React.ComponentPropsWithoutRef<"blockquote"> & ExtraProps) => (
    <blockquote
      className="border-l-4 border-border pl-3 text-sm text-muted-foreground italic mb-2"
      {...props}
    >
      {children}
    </blockquote>
  ),
  // Inline code
  code: ({ children, ...props }: React.ComponentPropsWithoutRef<"code"> & ExtraProps) => (
    <code
      className="bg-muted text-foreground rounded px-1 py-0.5 text-xs font-mono"
      {...props}
    >
      {children}
    </code>
  ),
  // Code block (fenced)
  pre: ({ children, ...props }: React.ComponentPropsWithoutRef<"pre"> & ExtraProps) => (
    <pre
      className="bg-muted text-foreground rounded p-3 text-xs font-mono overflow-x-auto mb-2"
      {...props}
    >
      {children}
    </pre>
  ),
  // Horizontal rule
  hr: (props: React.ComponentPropsWithoutRef<"hr"> & ExtraProps) => (
    <hr className="border-border my-3" {...props} />
  ),
  // Links — safe protocols only; open in new tab with noopener.
  a: ({ href, children, ...props }: React.ComponentPropsWithoutRef<"a"> & ExtraProps) => {
    if (!isSafeUrl(href)) {
      // Render as plain text when the protocol is not allowed.
      return <span>{children}</span>;
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80"
        {...props}
      >
        {children}
      </a>
    );
  },
  // Images are explicitly disabled on operator-authored public content.
  img: () => null,
  // Table support (from remark-gfm)
  table: ({ children, ...props }: React.ComponentPropsWithoutRef<"table"> & ExtraProps) => (
    <div className="overflow-x-auto mb-2">
      <table className="text-sm border-collapse w-full" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }: React.ComponentPropsWithoutRef<"th"> & ExtraProps) => (
    <th className="border border-border px-2 py-1 text-left font-medium text-foreground bg-muted" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.ComponentPropsWithoutRef<"td"> & ExtraProps) => (
    <td className="border border-border px-2 py-1 text-foreground" {...props}>
      {children}
    </td>
  ),
};

const PLUGINS = [remarkGfm];

export default function Markdown({ content, className }: MarkdownProps) {
  if (!content) return null;

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
