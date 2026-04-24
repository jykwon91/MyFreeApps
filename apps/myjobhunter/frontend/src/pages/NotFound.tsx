import { Link } from "react-router-dom";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 gap-4">
      <p className="text-6xl font-bold text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        I couldn&apos;t find what you were looking for. The page may have moved or never existed.
      </p>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 mt-2 text-sm font-medium text-primary hover:underline"
      >
        <Home className="w-4 h-4" />
        Back to Dashboard
      </Link>
    </div>
  );
}
