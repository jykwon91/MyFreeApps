import { Link } from "react-router-dom";

export default function LegalFooter() {
  return (
    <footer className="flex items-center justify-center gap-4 py-3 text-xs text-muted-foreground border-t bg-background">
      <Link to="/privacy" className="hover:underline hover:text-foreground transition-colors">
        Privacy Policy
      </Link>
      <span aria-hidden="true">·</span>
      <Link to="/terms" className="hover:underline hover:text-foreground transition-colors">
        Terms of Service
      </Link>
      <span aria-hidden="true">·</span>
      <a
        href="mailto:jasonykwon91@gmail.com"
        className="hover:underline hover:text-foreground transition-colors"
      >
        Contact
      </a>
    </footer>
  );
}
