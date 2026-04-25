import { Link } from "react-router-dom";

export default function Forbidden() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold mb-3">Hmm, can't go there</h1>
        <p className="text-muted-foreground mb-6">
          It looks like you don't have access to this page. You might need to
          ask an admin to upgrade your role.
        </p>
        <Link
          to="/"
          className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
