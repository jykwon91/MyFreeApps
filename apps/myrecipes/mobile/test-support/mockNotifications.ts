/** Stands in for expo-notifications: no alert opened the app, and none are set. */
export const setNotificationHandler = jest.fn();
export const getLastNotificationResponse = jest.fn(() => null);
export const clearLastNotificationResponse = jest.fn();
export const addNotificationResponseReceivedListener = jest.fn(() => ({ remove: jest.fn() }));
export const cancelAllScheduledNotificationsAsync = jest.fn(() => Promise.resolve());
export const dismissAllNotificationsAsync = jest.fn(() => Promise.resolve());
