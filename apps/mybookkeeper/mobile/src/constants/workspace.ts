import type { Href } from "expo-router";

/** In documents, so it outlives a restart. It holds a workspace id and whose choice it was. */
export const SAVED_WORKSPACE_FILE = "active-workspace.json";

/** Where someone lands after changing workspace: the old one's screens no longer apply. */
export const WORKSPACE_HOME_ROUTE: Href = "/";

export const WORKSPACE_MESSAGES = {
  section: "Workspace",
  current: (name: string, role: string) => `${name}, ${role}`,
  switchWorkspace: "Switch workspace",
  switchHint: "Shows the workspaces you belong to.",
  switchTitle: "Your workspaces",
  switchDescription: "What you see and add on this phone belongs to the workspace you pick.",
  switched: (name: string) => `You're now in ${name}.`,
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
