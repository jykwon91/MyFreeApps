// Per-page empty-state copy — exact text approved in UX review.
// Icon names reference lucide-react icons; components resolve them at runtime.

export interface EmptyStateCopy {
  iconName: string;
  heading: string;
  body: string;
  actionLabel: string;
}

export interface EmptyStateCopyNoAction {
  iconName: string;
  heading: string;
  body: string;
}

export const DISCOVER_EMPTY_STATES: Record<"no_saved_searches" | "inbox_empty", EmptyStateCopyNoAction> = {
  no_saved_searches: {
    iconName: "Telescope",
    heading: "No saved searches yet",
    body:
      "Create a saved search and I'll pull tailored postings from " +
      "Google Jobs (LinkedIn, Indeed, Glassdoor, ZipRecruiter) every " +
      "time you click Refresh.",
  },
  inbox_empty: {
    iconName: "Telescope",
    heading: "Inbox empty",
    body: "Click Refresh on a saved search above to fetch the latest postings.",
  },
};

export const EMPTY_STATES = {
  dashboard: {
    iconName: "Briefcase",
    heading: "Your hunt starts here",
    body: "I don't have anything to track yet. Add your first application and I'll start building your pipeline.",
    actionLabel: "Add application",
  },
  applications: {
    iconName: "FilePlus",
    heading: "No applications yet",
    body: "Drop your first one in and I'll keep track of where things stand.",
    actionLabel: "Add application",
  },
  profile: {
    iconName: "UserCircle",
    heading: "Tell me about yourself",
    body: "Upload your resume and I'll pull out your work history, skills, and education — you can fill in the gaps from there.",
    actionLabel: "Upload resume",
  },
  companies: {
    iconName: "Building2",
    heading: "No companies here yet",
    body: "I'll add companies here as you log applications — no need to add them separately.",
    actionLabel: "Go to Applications",
  },
} as const satisfies Record<string, EmptyStateCopy>;
