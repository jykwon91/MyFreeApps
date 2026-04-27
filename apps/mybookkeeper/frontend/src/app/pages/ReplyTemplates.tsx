import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import ReplyTemplatesManager from "@/app/features/inquiries/ReplyTemplatesManager";

/**
 * Reply-template administration page. Reachable from the Inquiries page
 * header. Hosts manage their per-user template library here.
 */
export default function ReplyTemplates() {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <Link
        to="/inquiries"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to inquiries
      </Link>
      <SectionHeader
        title="Reply templates"
        subtitle="Manage the canned replies available in the inquiry-reply panel."
      />
      <ReplyTemplatesManager />
    </main>
  );
}
