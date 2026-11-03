import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { COOK_TIMER_CHANNEL_ID } from "../constants/cook";
import type { CookTimer } from "../types/CookTimer";
import type { CookTimerAlert } from "../types/CookTimerAlert";
import { formatTimerDuration } from "../utils/formatCookTimer";
import { isCookTimer } from "../utils/isCookTimer";

export function showCookTimerAlertsInForeground(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function canNotify(mayAsk: boolean): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!mayAsk || !current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/**
 * Sets the alert for a timer, or replaces the one it has. Android delivers it late, without
 * saying so, unless exact alarms are allowed.
 */
export async function scheduleCookTimerAlert(timer: CookTimer, mayAsk: boolean): Promise<CookTimerAlert> {
  if (!(await canNotify(mayAsk))) return "off";
  // It ran out while the permission prompt was up, so there's nothing left to schedule.
  if (timer.endsAt <= Date.now()) return "scheduled";
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(COOK_TIMER_CHANNEL_ID, {
      name: "Cooking timers",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  await Notifications.scheduleNotificationAsync({
    identifier: timer.id,
    content: {
      title: `${formatTimerDuration(timer.seconds)} timer is done`,
      body: `${timer.recipeTitle}, step ${timer.stepNumber}`,
      data: { timer },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(timer.endsAt),
      channelId: COOK_TIMER_CHANNEL_ID,
    },
  });
  if (Platform.OS !== "android") return "scheduled";
  const exact = await Notifications.getExactAlarmPermissionsAsync().catch(() => ({ granted: false }));
  return exact.granted ? "scheduled" : "late";
}

/** Whether exact alarms are now allowed. Android may send someone to Settings for this. */
export async function requestExactCookTimerAlerts(): Promise<boolean> {
  return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
}

export async function cancelCookTimerAlert(timerId: string): Promise<void> {
  await Promise.allSettled([
    Notifications.cancelScheduledNotificationAsync(timerId),
    Notifications.dismissNotificationAsync(timerId),
  ]);
}

function cookTimerIn(content: Notifications.NotificationContent): CookTimer[] {
  const timer = content.data?.timer;
  return isCookTimer(timer) ? [timer] : [];
}

/** Timers whose alerts outlived the app being closed: still waiting, or gone off and still showing. */
export async function restorableCookTimers(): Promise<CookTimer[]> {
  const [scheduled, presented] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    Notifications.getPresentedNotificationsAsync(),
  ]);
  const timers = [
    ...scheduled.flatMap((request) => cookTimerIn(request.content)),
    ...presented.flatMap((notification) => cookTimerIn(notification.request.content)),
  ];
  return [...new Map(timers.map((timer) => [timer.id, timer])).values()];
}

/** Calls back with the recipe of a timer alert that was tapped, including the one that opened the app. */
export function onCookTimerAlertOpened(open: (recipeId: string) => void): () => void {
  const handle = (response: Notifications.NotificationResponse | null) => {
    const [timer] = response ? cookTimerIn(response.notification.request.content) : [];
    if (!timer) return;
    Notifications.clearLastNotificationResponse();
    open(timer.recipeId);
  };
  handle(Notifications.getLastNotificationResponse());
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}
