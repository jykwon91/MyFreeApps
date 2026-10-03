import RaidDiscordLink from "@/games/wow-forever/components/raid/RaidDiscordLink";

interface RaidNoSignupsProps {
  discordUrl: string | null;
}

/** Nobody in the line-up yet: sign-ups happen on the raid's post, so point there. */
export default function RaidNoSignups({ discordUrl }: RaidNoSignupsProps) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed bg-card p-6 text-center">
      <p className="text-sm text-muted-foreground">No sign-ups yet — sign up from the raid's post in Discord.</p>
      {discordUrl && <RaidDiscordLink url={discordUrl} />}
    </div>
  );
}
