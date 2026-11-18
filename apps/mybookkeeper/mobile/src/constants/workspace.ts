import type { Href } from "expo-router";

/** In documents, so it outlives a restart. It holds a workspace id and whose choice it was. */
export const SAVED_WORKSPACE_FILE = "active-workspace.json";

/** Where someone lands after changing workspace: the old one's screens no longer apply. */
export const WORKSPACE_HOME_ROUTE: Href = "/";

/**
 * How often the workspace list is asked for again while the app runs offline on the saved workspace.
 * Nothing on the phone says when the connection is back, so it keeps asking; offline, a try fails at once.
 */
export const OFFLINE_RETRY_MS = 15_000;

export const WORKSPACE_MESSAGES = {
  loading: "Loading your workspace",
  section: "Workspace",
  current: (name: string, role: string) => `${name}, ${role}`,
  currentOffline: (name: string) => `${name}, offline`,
  offlineCanCapture: (name: string) =>
    `You're offline, so I've opened ${name} from last time. Photos you take are saved here and upload when you're back online.`,
  offlineReadOnly: (name: string) => `You're offline, so I've opened ${name} from last time. It'll update when you're back online.`,
  switchWorkspace: "Switch workspace",
  switchHint: "Shows the workspaces you belong to.",
  switchTitle: "Your workspaces",
  switchDescription: "What you see and add on this phone belongs to the workspace you pick.",
  switched: (name: string) => `You're now in ${name}.`,
  noWorkspaceHeading: "No workspace yet",
  noWorkspaceBody: "You're signed in, but you're not part of a workspace. Create your own, or ask an owner to invite you.",
  createFirst: "Create a workspace",
  newWorkspace: "New workspace",
  newWorkspaceHint: "Creates a workspace you own and switches to it.",
  createTitle: "New workspace",
  name: "Workspace name",
  namePlaceholder: "e.g. My Properties LLC",
  nameHint: "You'll be its owner. You can invite people from Members.",
  create: "Create workspace",
  creating: "Creating…",
  cancel: "Cancel",
  created: (name: string) => `I created ${name} and switched to it.`,
  createdNotOpened: (name: string) => `I created ${name}, but couldn't open it. Switch to it from More.`,
  demoRefused: "Demo accounts can't create workspaces.",
  couldntCreate: "I couldn't create that. Check your connection and try again.",
  couldntCreateServer: "I couldn't create that. Try again in a moment.",
} as const;
