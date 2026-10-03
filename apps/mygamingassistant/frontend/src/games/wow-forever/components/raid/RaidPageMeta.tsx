import { SITE_NAME } from "@/games/wow-forever/data/raidPage";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";

interface RaidPageMetaProps {
  /** The raid's title, or what the page shows instead ("Raid not found"). */
  title: string;
}

/**
 * The raid page's tab title, and `noindex` for its HTML — the API sends `X-Robots-Tag: noindex` with its JSON;
 * React 19 hoists this `<meta>` into the head.
 */
export default function RaidPageMeta({ title }: RaidPageMetaProps) {
  useDocumentTitle(`${title} · ${SITE_NAME}`);
  return <meta name="robots" content="noindex" />;
}
