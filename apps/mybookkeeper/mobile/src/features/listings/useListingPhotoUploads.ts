import { LISTING_PHOTO_MAX_MB } from "@mybookkeeper/api-client/constants/listingPhotos";
import { useUploadListingPhotosMutation } from "@mybookkeeper/api-client/store/listingsApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { nanoid } from "@reduxjs/toolkit";
import { useEffect, useRef, useState } from "react";
import { uploadFailureCopy } from "../../constants/listingPhotos";
import { filePart } from "../../lib/filePart";
import type { FileForUpload } from "../../types/FileForUpload";
import type { ListingPhotoBatch } from "../../types/ListingPhotoBatch";
import type { ListingPhotoUpload } from "../../types/ListingPhotoUpload";
import { releaseHeldFile } from "../uploads/heldFile";

const FILES_FIELD = "files";

/**
 * Sends photos one request each, in order. The server refuses a whole request if one photo in it
 * is bad, so one at a time is what lets a single failure be retried on its own.
 */
export function useListingPhotoUploads(listingId: string, onUploaded: (count: number) => void) {
  const [uploadPhotos] = useUploadListingPhotosMutation();
  const [items, setItems] = useState<ListingPhotoUpload[]>([]);
  const [batch, setBatch] = useState<ListingPhotoBatch>({ total: 0, done: 0 });
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const succeeded = useRef(0);
  const held = useRef<ListingPhotoUpload[]>([]);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      for (const item of held.current) releaseHeldFile(item.file.uri);
    };
  }, []);

  function update(next: (current: ListingPhotoUpload[]) => ListingPhotoUpload[]): void {
    held.current = next(held.current);
    if (isMounted.current) setItems(held.current);
  }

  function setStatus(key: string, status: ListingPhotoUpload["status"], problem: string | null): void {
    update((current) => current.map((item) => (item.key === key ? { ...item, status, problem } : item)));
  }

  async function send(item: ListingPhotoUpload): Promise<void> {
    setStatus(item.key, "sending", null);
    const form = new FormData();
    form.append(FILES_FIELD, filePart(item.file));
    try {
      await uploadPhotos({ listingId, form }).unwrap();
      releaseHeldFile(item.file.uri);
      update((current) => current.filter((candidate) => candidate.key !== item.key));
      succeeded.current += 1;
    } catch (error) {
      setStatus(item.key, "failed", uploadFailureCopy(httpStatus(error), LISTING_PHOTO_MAX_MB));
    } finally {
      pending.current -= 1;
      if (pending.current === 0) {
        if (succeeded.current > 0) onUploaded(succeeded.current);
        succeeded.current = 0;
      }
      if (isMounted.current) setBatch((current) => ({ ...current, done: current.done + 1 }));
    }
  }

  function enqueue(queued: ListingPhotoUpload[]): void {
    const isIdle = pending.current === 0;
    pending.current += queued.length;
    if (isMounted.current) setBatch((current) => (isIdle ? { total: queued.length, done: 0 } : { ...current, total: current.total + queued.length }));
    for (const item of queued) chain.current = chain.current.then(() => send(item));
  }

  function add(files: FileForUpload[]): void {
    const queued = files.map<ListingPhotoUpload>((file) => ({ key: nanoid(), file, status: "waiting", problem: null }));
    update((current) => [...current, ...queued]);
    enqueue(queued);
  }

  function retry(key: string): void {
    const item = held.current.find((candidate) => candidate.key === key);
    if (!item || item.status !== "failed") return;
    update((current) => current.map((candidate) => (candidate.key === key ? { ...candidate, status: "waiting", problem: null } : candidate)));
    enqueue([item]);
  }

  function discard(key: string): void {
    const item = held.current.find((candidate) => candidate.key === key);
    if (!item || item.status !== "failed") return;
    releaseHeldFile(item.file.uri);
    update((current) => current.filter((candidate) => candidate.key !== key));
  }

  const isSending = items.some((item) => item.status !== "failed");
  const hasFailed = items.some((item) => item.status === "failed");
  return { items, batch, add, retry, discard, isSending, hasFailed };
}
