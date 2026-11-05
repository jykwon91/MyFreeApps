import type { CalendarEvent } from "@mybookkeeper/api-client/types/calendar/calendar-event";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { SectionList } from "react-native";
import { CALENDAR_OPEN_RETRY_LIMIT, CALENDAR_OPEN_RETRY_MS } from "../../constants/calendar";
import type { CalendarSection } from "../../types/CalendarSection";

/**
 * Scrolls to a section once each time `openKey` appears. A list can't scroll to a row it hasn't
 * measured yet, so a miss tries again shortly. If it never lands, the list stays at the top.
 */
export function useOpenAtSection(
  list: RefObject<SectionList<CalendarEvent, CalendarSection> | null>,
  openKey: string | null,
  sectionIndex: number | null,
): () => void {
  const openedKey = useRef<string | null>(null);
  const target = useRef(sectionIndex);
  const retries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scroll = useCallback(() => {
    if (target.current === null) return;
    list.current?.scrollToLocation({ sectionIndex: target.current, itemIndex: 0, animated: false });
  }, [list]);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    target.current = sectionIndex;
  }, [sectionIndex]);

  useEffect(() => {
    if (openedKey.current === openKey) return;
    openedKey.current = openKey;
    clearTimer();
    if (openKey === null) return;
    retries.current = 0;
    scroll();
  }, [clearTimer, openKey, scroll]);

  useEffect(() => clearTimer, [clearTimer]);

  return useCallback(() => {
    if (retries.current >= CALENDAR_OPEN_RETRY_LIMIT) return;
    retries.current += 1;
    clearTimer();
    timer.current = setTimeout(scroll, CALENDAR_OPEN_RETRY_MS);
  }, [clearTimer, scroll]);
}
