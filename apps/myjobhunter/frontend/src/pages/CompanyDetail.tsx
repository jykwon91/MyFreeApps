import { useParams, Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import CompanyDetailSkeleton from "@/features/companies/CompanyDetailSkeleton";

// Phase 1: no real data — always shows 404 for any id
const IS_LOADING = false;

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();

  if (IS_LOADING) {
    return <CompanyDetailSkeleton />;
  }

  return (
    <div className="p-6 flex flex-col items-center text-center gap-4 py-20">
      <p className="text-4xl font-bold text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">
        I couldn&apos;t find that company — it may have been removed.
      </h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        The company with id <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{id}</code> doesn&apos;t exist.
      </p>
      <Link
        to="/companies"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline mt-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Companies
      </Link>
    </div>
  );
}
