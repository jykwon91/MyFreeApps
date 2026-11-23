import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertBox } from "@platform/ui";
import EditorHeader from "@/features/recipes/EditorHeader";
import RecipeEditorForm from "@/features/recipes/RecipeEditorForm";
import RecipeExtractionStep from "@/features/recipes/RecipeExtractionStep";
import RecipeImportUploadStep from "@/features/recipes/RecipeImportUploadStep";
import { useExtractRecipeFromPhotoMutation } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";
import { PHOTO_IMPORT_COPY } from "@myrecipes/api-client/constants/photoImport";
import { CHOOSE_AGAIN_DISCARD_COPY } from "@myrecipes/api-client/constants/recipeDiscard";
import { photoImportErrorMessage } from "@myrecipes/api-client/utils/photoImportErrorMessage";
import { photoImportProblemIsThePhoto } from "@myrecipes/api-client/utils/photoImportProblemIsThePhoto";
import { downscalePhoto } from "@/utils/downscalePhoto";

type ImportStep = "upload" | "extracting" | "review";
type Extraction = ReturnType<ReturnType<typeof useExtractRecipeFromPhotoMutation>[0]>;

/**
 * Photo import flow, all on one route (/recipes/import) with internal step
 * state — the draft is transient and can't be reconstructed from a URL.
 *   upload     -> pick + preview a photo, trigger extraction
 *   extracting -> full-section loading (synchronous Claude vision call); leaving the page
 *                 asks first, then cancels the request
 *   review     -> the extracted draft drops into the normal editor for
 *                 review/edit, then saves through the standard create flow
 */
export default function RecipeImport() {
  const [step, setStep] = useState<ImportStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeExtractionDraft | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractRecipe] = useExtractRecipeFromPhotoMutation();
  // The request still being waited on. Only it may answer: one cancelled, or from a page that's gone, is dropped.
  const current = useRef<Extraction | null>(null);
  const isMounted = useRef(true);

  // Free the preview blob URL when it changes or the page unmounts.
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  // Leaving mid-read is asked about by RecipeExtractionStep; once left, the request is cancelled.
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      current.current?.abort();
      current.current = null;
    };
  }, []);

  function selectFile(next: File) {
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(next);
    });
    setFile(next);
    setExtractError(null);
  }

  function clearFile() {
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFile(null);
  }

  async function handleExtract() {
    if (!file) return;
    setStep("extracting");
    const formData = new FormData();
    formData.append("file", await downscalePhoto(file));
    if (!isMounted.current) return;
    const request = extractRecipe(formData);
    current.current = request;
    try {
      const result = await request.unwrap();
      if (current.current !== request) return;
      setDraft(result);
      setStep("review");
    } catch (err) {
      if (current.current !== request) return;
      setExtractError(photoImportErrorMessage(err));
      // Kept for another try, unless the photo itself is what can't be read.
      if (photoImportProblemIsThePhoto(err)) clearFile();
      setStep("upload");
    } finally {
      if (current.current === request) current.current = null;
    }
  }

  if (step === "extracting") {
    return (
      <div className="p-4 sm:p-8 space-y-6">
        <EditorHeader backTo="/" backLabel="Recipes" title={PHOTO_IMPORT_COPY.title} />
        <RecipeExtractionStep />
      </div>
    );
  }

  if (step === "review" && draft) {
    return (
      <div className="p-4 sm:p-8 space-y-6">
        <EditorHeader
          backTo="/"
          backLabel="Recipes"
          title={PHOTO_IMPORT_COPY.title}
          subtitle="We've pre-filled what we could from your photo — edit anything that looks off, then save."
        />
        <RecipeEditorForm
          mode="create"
          seed={{ draft, origin: "photo" }}
          onCancel={() => setStep("upload")}
          cancelCopy={CHOOSE_AGAIN_DISCARD_COPY}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <EditorHeader
        backTo="/"
        backLabel="Recipes"
        title={PHOTO_IMPORT_COPY.title}
        subtitle="Snap or upload a photo of a recipe and we'll fill in the details for you to review."
      />
      {extractError ? <AlertBox variant="warning" role="alert">{extractError}</AlertBox> : null}
      <RecipeImportUploadStep
        file={file}
        objectUrl={objectUrl}
        onSelect={selectFile}
        onClear={clearFile}
        onExtract={handleExtract}
      />
      <p className="text-sm text-muted-foreground">
        Prefer to type it in?{" "}
        <Link to="/recipes/new" className="text-primary underline underline-offset-2">
          Enter your recipe manually
        </Link>
        .
      </p>
    </div>
  );
}
