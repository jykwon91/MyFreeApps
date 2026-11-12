import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertBox } from "@platform/ui";
import EditorHeader from "@/features/recipes/EditorHeader";
import RecipeEditorForm from "@/features/recipes/RecipeEditorForm";
import RecipeExtractionProgress from "@/features/recipes/RecipeExtractionProgress";
import RecipeImportUploadStep from "@/features/recipes/RecipeImportUploadStep";
import { useExtractRecipeFromPhotoMutation } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeExtractionDraft } from "@myrecipes/api-client/types/recipe/extraction";
import { PHOTO_IMPORT_COPY } from "@myrecipes/api-client/constants/photoImport";
import { photoImportErrorMessage } from "@myrecipes/api-client/utils/photoImportErrorMessage";

type ImportStep = "upload" | "extracting" | "review";

/**
 * Photo import flow, all on one route (/recipes/import) with internal step
 * state — the draft is transient and can't be reconstructed from a URL.
 *   upload     -> pick + preview a photo, trigger extraction
 *   extracting -> full-section loading (synchronous Claude vision call)
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

  // Free the preview blob URL when it changes or the page unmounts.
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  // Warn before a browser close/refresh abandons an in-flight extraction.
  useEffect(() => {
    if (step !== "extracting") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [step]);

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
    formData.append("file", file);
    try {
      const result = await extractRecipe(formData).unwrap();
      setDraft(result);
      setStep("review");
    } catch (err) {
      setExtractError(photoImportErrorMessage(err));
      clearFile();
      setStep("upload");
    }
  }

  if (step === "extracting") {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <EditorHeader backTo="/" backLabel="Recipes" title={PHOTO_IMPORT_COPY.title} />
        <RecipeExtractionProgress />
      </main>
    );
  }

  if (step === "review" && draft) {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <EditorHeader
          backTo="/"
          backLabel="Recipes"
          title={PHOTO_IMPORT_COPY.title}
          subtitle="We've pre-filled what we could from your photo — edit anything that looks off, then save."
        />
        <RecipeEditorForm mode="create" initialDraft={draft} onCancel={() => setStep("upload")} />
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <EditorHeader
        backTo="/"
        backLabel="Recipes"
        title={PHOTO_IMPORT_COPY.title}
        subtitle="Snap or upload a photo of a recipe and we'll fill in the details for you to review."
      />
      {extractError ? <AlertBox variant="warning">{extractError}</AlertBox> : null}
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
    </main>
  );
}
