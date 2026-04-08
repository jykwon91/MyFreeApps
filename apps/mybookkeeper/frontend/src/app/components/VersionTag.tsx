import { useGetVersionQuery } from "@/shared/store/versionApi";

export default function VersionTag() {
  const { data } = useGetVersionQuery();

  if (!data || data.commit === "unknown") return null;

  return (
    <div className="text-center" data-testid="version-tag">
      <span className="text-[10px] text-muted-foreground/50 select-all">
        v.{data.commit}
      </span>
    </div>
  );
}
