export const EXPIRES_SOON_DAYS = 90;
/** How far ahead a policy counts as running out soon (the amber badge, the phone's filter). */
export const EXPIRING_SOON_DAYS = 30;

export const EXPIRY_MESSAGES = {
  expiredDaysAgo: (days: number) => `Expired ${days} days ago`,
  expiredYesterday: "Expired yesterday",
  expiresToday: "Expires today",
  expiresTomorrow: "Expires tomorrow",
  expiresInDays: (days: number) => `Expires in ${days} days`,
} as const;
