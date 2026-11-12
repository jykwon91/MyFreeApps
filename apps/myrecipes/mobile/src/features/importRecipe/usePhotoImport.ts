import { useExtractRecipeFromPhotoMutation } from "@myrecipes/api-client/store/recipesApi";
import { photoImportErrorMessage } from "@myrecipes/api-client/utils/photoImportErrorMessage";
import { discardFile, filePart } from "@platform/mobile";
import { useEffect, useRef, useState } from "react";
import { IMPORT_RECIPE_MESSAGES as MESSAGES, RECIPE_PHOTO_MIME_TYPE, RECIPE_PHOTO_NAME } from "../../constants/importRecipe";
import type { PhotoImportState } from "../../types/PhotoImportState";
import type { PhotoSource } from "../../types/PhotoSource";
import type { PickedRecipePhoto } from "../../types/PickedRecipePhoto";
import { pickRecipePhoto } from "./pickRecipePhoto";

type Extraction = ReturnType<ReturnType<typeof useExtractRecipeFromPhotoMutation>[0]>;

/**
 * Importing a recipe from a photo, as the website's /recipes/import does: pick a photo, look at it,
 * then one request reads it into a draft for the new-recipe form. Leaving the screen cancels the
 * request. The screen is keyed by account, so another account signing in leaves too, and only the
 * request still current may answer: one cancelled, or from a screen that's gone, is dropped.
 * Refs, not state, say what's under way, so two taps before a re-render can't both start.
 */
export function usePhotoImport() {
  const [extractRecipe] = useExtractRecipeFromPhotoMutation();
  const [state, setState] = useState<PhotoImportState>({ step: "choose", problem: null });
  const [picking, setPicking] = useState<PhotoSource | null>(null);
  const isPicking = useRef(false);
  const current = useRef<Extraction | null>(null);
  // The photo on disk, so it's deleted however the screen is left. Null once it's been let go of.
  const photoUri = useRef<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      current.current?.abort();
      current.current = null;
      dropPhoto();
    };
  }, []);

  function dropPhoto(): void {
    if (photoUri.current) discardFile(photoUri.current);
    photoUri.current = null;
  }

  async function choose(source: PhotoSource): Promise<void> {
    if (isPicking.current || current.current) return;
    isPicking.current = true;
    setPicking(source);
    let picked: PickedRecipePhoto | "unreadable";
    try {
      picked = await pickRecipePhoto(source);
    } catch {
      picked = "unreadable";
    } finally {
      isPicking.current = false;
    }
    if (!isMounted.current) {
      if (picked && typeof picked === "object") discardFile(picked.uri);
      return;
    }
    setPicking(null);
    if (picked === null) return;
    if (picked === "denied") {
      setState({ step: "choose", problem: { message: MESSAGES.cameraDenied, needsSettings: true } });
    } else if (picked === "unreadable") {
      setState({ step: "choose", problem: { message: MESSAGES.photoUnreadable } });
    } else {
      dropPhoto();
      photoUri.current = picked.uri;
      setState({ step: "preview", photo: picked, problem: null });
    }
  }

  function chooseAgain(): void {
    current.current?.abort();
    current.current = null;
    dropPhoto();
    setState({ step: "choose", problem: null });
  }

  async function extract(): Promise<void> {
    if (isPicking.current || current.current || !photoUri.current) return;
    const photo = { uri: photoUri.current };
    const form = new FormData();
    form.append("file", filePart({ uri: photo.uri, name: RECIPE_PHOTO_NAME, mimeType: RECIPE_PHOTO_MIME_TYPE }));
    const request = extractRecipe(form);
    current.current = request;
    setState({ step: "reading", photo, startedAt: Date.now() });
    try {
      const draft = await request.unwrap();
      if (current.current !== request) return;
      dropPhoto();
      setState({ step: "review", draft });
    } catch (error) {
      if (current.current !== request) return;
      // Kept, so trying again doesn't mean taking it again.
      setState({ step: "preview", photo, problem: photoImportErrorMessage(error) });
    } finally {
      if (current.current === request) current.current = null;
    }
  }

  return { state, picking, choose, chooseAgain, extract };
}
