import { useParams } from "react-router-dom";
import { useGetGuildQuery } from "@/games/wow-forever/api/wowGuildApi";
import GuildPageBody from "@/games/wow-forever/components/guild/GuildPageBody";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { CHARACTER_PAGE_PATH } from "@/games/wow-forever/data/character/characterConfig";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";

/** /wow-forever/guild/:slug — a guild's stored members: find one and open their character. */
export default function WowGuildPage() {
  const { slug: rawSlug = "" } = useParams<{ slug: string }>();
  const slug = rawSlug.toLowerCase();
  const { data, error, isFetching, refetch } = useGetGuildQuery(slug, { skip: !slug });
  const guild = data && data.slug === slug ? data : undefined;
  useDocumentTitle(`${guild ? `<${guild.name}>` : "Guild"} · WoW Forever`);

  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-5xl">
      <WowPageHeader
        title={guild ? `<${guild.name}>` : "Guild"}
        subtitle="Everyone in the guild we have from Blizzard — find a member and open their character."
        backTo={CHARACTER_PAGE_PATH}
        backLabel="Back to Your character"
      />
      <GuildPageBody guild={guild} error={error} isFetching={isFetching} onRetry={refetch} />
    </main>
  );
}
