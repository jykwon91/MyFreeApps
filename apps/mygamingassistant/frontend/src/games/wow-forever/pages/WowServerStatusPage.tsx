import ServerStatusHistorySection from "@/games/wow-forever/components/serverStatus/history/ServerStatusHistorySection";
import LoginErrorHelp from "@/games/wow-forever/components/serverStatus/loginErrors/LoginErrorHelp";
import WowServerStatusSection from "@/games/wow-forever/components/serverStatus/WowServerStatusSection";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";

/** /wow-forever/server-status — live realm status, uptime history and help with login errors. */
export default function WowServerStatusPage() {
  useDocumentTitle("Server status · WoW Forever");
  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader
        title="Server status"
        subtitle="Is the realm up, how has it been lately, and what to do when you can't log in."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <WowServerStatusSection historyLink={false} />
      <ServerStatusHistorySection />
      <LoginErrorHelp />
    </main>
  );
}
