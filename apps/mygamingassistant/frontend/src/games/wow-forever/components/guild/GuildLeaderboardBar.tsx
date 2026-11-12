interface GuildLeaderboardBarProps {
  /** The bar's width, in percent. */
  percent: number;
}

/** A thin bar of a member's number against the leader's (decoration: the number itself is beside it). */
export default function GuildLeaderboardBar({ percent }: GuildLeaderboardBarProps) {
  return (
    <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-muted">
      <span
        className="block h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-500"
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}
