import { Link } from "react-router-dom";
import { Wand2, Mail, ChevronRight } from "lucide-react";
import { ADMIN_ROUTES } from "@/constants/admin-routes";
import {
  ADMIN_DASHBOARD_CARDS,
  type AdminDashboardCardId,
} from "@/features/admin/dashboard/cards";
import AdminDashboardCard from "@/features/admin/dashboard/AdminDashboardCard";

const ICONS: Record<AdminDashboardCardId, React.ReactNode> = {
  demo: <Wand2 className="size-5" />,
  invites: <Mail className="size-5" />,
};

const TARGETS: Record<AdminDashboardCardId, string> = {
  demo: ADMIN_ROUTES.DEMO_USERS,
  invites: ADMIN_ROUTES.INVITES,
};

export default function AdminDashboard() {
  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Operator-only tools. Each card jumps to a focused page.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {ADMIN_DASHBOARD_CARDS.map((card) => (
          <Link
            key={card.id}
            to={TARGETS[card.id]}
            className="group rounded-lg border border-border bg-card p-4 hover:bg-muted transition-colors min-h-[88px] flex"
          >
            <AdminDashboardCard
              icon={ICONS[card.id]}
              title={card.title}
              description={card.description}
              chevron={<ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />}
            />
          </Link>
        ))}
      </div>
    </main>
  );
}
