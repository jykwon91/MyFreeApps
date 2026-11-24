import { useNavigate } from "react-router-dom";
import { useGetNetWorthQuery } from "@mybookkeeper/api-client/store/netWorthApi";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import NetWorthBody from "@/app/features/net-worth/NetWorthBody";
import { NET_WORTH_MESSAGES as MSG } from "@/shared/lib/net-worth-messages";
import { NET_WORTH_UPDATE_PAGES } from "@/shared/lib/net-worth-update-pages";

/**
 * Everything the person has minus everything they owe: their open accounts,
 * loan records not already tracked as an account, and the workspace's
 * properties they've put a value on. A chart shows how it has moved.
 */
export default function NetWorth() {
  const query = useGetNetWorthQuery();
  const navigate = useNavigate();

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <SectionHeader title={MSG.pageTitle} subtitle={MSG.pageSubtitle} />
      <NetWorthBody
        data={query.data}
        isLoading={query.isLoading}
        isError={query.isError}
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
        onAddAccount={() => void navigate(NET_WORTH_UPDATE_PAGES.account)}
      />
    </div>
  );
}
