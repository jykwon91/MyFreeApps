import { discardFile } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import type { HeldPhotoPickerOptions } from "../../types/HeldPhotoPickerOptions";
import type { HeldPhotoSource } from "../../types/HeldPhotoSource";
import type { PhotoPreparing } from "../../types/PhotoPreparing";
import { chooseLibraryAssets } from "./chooseLibraryAssets";
import { releaseHeldFile } from "./heldFile";
import { holdPhoto, takeHeldPhoto } from "./pickHeldFile";

/**
 * Gets photos from the camera or library and hands each to `onReady` the moment it is ready, rather
 * than after the last one. If the screen goes meanwhile it stops, and lets go of what it had made.
 */
export function useHeldPhotoPicker({ onReady, nextName, selectionLimit, messages }: HeldPhotoPickerOptions) {
  const [isBusy, setIsBusy] = useState(false);
  const [preparing, setPreparing] = useState<PhotoPreparing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const isWorking = useRef(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /** Returns how many couldn't be read. */
  async function prepareAll(assets: Parameters<typeof holdPhoto>[0][]): Promise<number> {
    let unreadable = 0;
    for (const [index, asset] of assets.entries()) {
      if (!isMounted.current) {
        // The picker's own copy of each photo that was never prepared.
        for (const rest of assets.slice(index)) discardFile(rest.uri);
        return unreadable;
      }
      setPreparing({ done: index, total: assets.length });
      try {
        const file = await holdPhoto(asset, nextName());
        if (isMounted.current) onReady(file);
        else releaseHeldFile(file.uri);
      } catch {
        unreadable += 1;
      }
    }
    return unreadable;
  }

  async function add(source: HeldPhotoSource): Promise<void> {
    if (isWorking.current) return;
    isWorking.current = true;
    setIsBusy(true);
    setProblem(null);
    try {
      let unreadable = 0;
      if (source === "camera") {
        const photo = await takeHeldPhoto(nextName());
        if (photo === "denied") setProblem(messages.cameraDenied);
        else if (photo && isMounted.current) onReady(photo);
        else if (photo) releaseHeldFile(photo.uri);
      } else {
        unreadable = await prepareAll(await chooseLibraryAssets(selectionLimit));
      }
      if (unreadable > 0 && isMounted.current) setProblem(messages.pickFailed);
    } catch {
      if (isMounted.current) setProblem(messages.pickFailed);
    } finally {
      isWorking.current = false;
      if (isMounted.current) {
        setIsBusy(false);
        setPreparing(null);
      }
    }
  }

  return { add, isBusy, preparing, problem };
}
