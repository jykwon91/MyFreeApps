import { AppVersion } from "@platform/mobile";
import { useGetVersionQuery } from "@mybookkeeper/api-client/store/versionApi";
import { UNKNOWN_SERVER_COMMIT } from "../../constants/serverVersion";

/** This phone's build with the server's beside it; the server part is left out if it can't be fetched. */
export default function ServerAppVersion() {
  const { data, isLoading } = useGetVersionQuery();
  const commit = data && data.commit !== UNKNOWN_SERVER_COMMIT ? data.commit : undefined;
  return <AppVersion isServerLoading={isLoading} serverCommit={commit} />;
}
