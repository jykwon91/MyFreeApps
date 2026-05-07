/**
 * Contacts section of the ApplicationDrawer.
 *
 * Reads from the detail endpoint's eagerly-loaded contacts (no separate
 * fetch). v1 surfaces existing contacts read-only; CRUD lives behind the
 * full ApplicationDetail page (link: "Open in full page" in the drawer
 * header) until we extract the contact-CRUD UI into a shared dialog in
 * a follow-up.
 *
 * Captured in TECH_DEBT: a future PR should extract a ContactsManager
 * dialog used by both the drawer and ApplicationDetail.
 */
import { Mail, Link2 } from "lucide-react";
import { Badge } from "@platform/ui";

interface DrawerContact {
  id: string;
  name: string | null;
  email: string | null;
  linkedin_url: string | null;
  role: string;
  notes: string | null;
}

interface ContactsSectionProps {
  contacts: DrawerContact[];
}

const ROLE_LABELS: Record<string, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  interviewer: "Interviewer",
  referrer: "Referrer",
  other: "Other",
};

export default function ContactsSection({ contacts }: ContactsSectionProps) {
  return (
    <section>
      <h2 className="text-sm font-medium mb-3">
        Contacts{" "}
        <span className="text-muted-foreground font-normal">({contacts.length})</span>
      </h2>
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30">
          No contacts yet. Add them from the full application page.
        </p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="border rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {c.name ?? c.email ?? "Unnamed contact"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABELS[c.role] ?? c.role}
                  </p>
                </div>
                <Badge label={ROLE_LABELS[c.role] ?? c.role} color="blue" />
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs">
                {c.email ? (
                  <a
                    href={`mailto:${c.email}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Mail size={12} />
                    {c.email}
                  </a>
                ) : null}
                {c.linkedin_url ? (
                  <a
                    href={c.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Link2 size={12} />
                    LinkedIn
                  </a>
                ) : null}
              </div>
              {c.notes ? (
                <p className="text-xs mt-2 whitespace-pre-wrap text-muted-foreground">
                  {c.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
