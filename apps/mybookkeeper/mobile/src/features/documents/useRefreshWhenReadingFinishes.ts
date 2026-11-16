import { EMAIL_DERIVED_TAGS } from "@mybookkeeper/api-client/constants/emailDerivedTags";
import { integrationsApi } from "@mybookkeeper/api-client/store/integrationsApi";
import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../../lib/store";

/**
 * A document that finishes being read has just changed everything derived from
 * extraction (see EMAIL_DERIVED_TAGS), so when fewer are being read, all of it is refreshed.
 */
export function useRefreshWhenReadingFinishes(beingRead: number): void {
  const dispatch = useDispatch<AppDispatch>();
  const lastBeingRead = useRef(beingRead);
  useEffect(() => {
    if (beingRead < lastBeingRead.current) {
      dispatch(integrationsApi.util.invalidateTags(EMAIL_DERIVED_TAGS));
    }
    lastBeingRead.current = beingRead;
  }, [beingRead, dispatch]);
}
