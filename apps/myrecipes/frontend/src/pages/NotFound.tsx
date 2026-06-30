import { Link } from "react-router-dom";
import { ChefHat } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 px-4 text-center">
      <ChefHat className="h-16 w-16 text-muted-foreground mb-4" aria-hidden />
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <p className="text-muted-foreground mb-6">
        Page not found. It may have moved or never existed.
      </p>
      <Link
        to="/"
        className="inline-block bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 min-h-[44px] leading-7"
      >
        Back to recipes
      </Link>
    </div>
  );
}
