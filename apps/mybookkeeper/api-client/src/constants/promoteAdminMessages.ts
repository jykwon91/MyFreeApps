/** Asked on the website and the phone before someone becomes an admin. */
export const PROMOTE_ADMIN_MESSAGES = {
  title: (name: string) => `Make ${name} an admin?`,
  body: "They'll be able to invite people, change roles and remove members.",
  confirm: "Make admin",
} as const;
