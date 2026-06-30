import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertBox } from "@platform/ui";
import EditorHeader from "@/features/recipes/EditorHeader";
import RecipeEditorForm from "@/features/recipes/RecipeEditorForm";
import RecipeExtractionProgress from "@/features/recipes/RecipeExtractionProgress";
import RecipeImportUploadStep from "@/features/recipes/RecipeImportUploadStep";
import { useExtractRecipeFromPhotoMutation } from "@/store/recipesApi";
import type { RecipeExtractionDraft } from "@/types/recipe/extraction";

type ImportStep = "upload" | "extracting" | "review";

function messageForError(err: unknown): string {
  const status = (err as { status?: number } | null)?.status;
  if (status === 422) {
    return "We couldn't read a recipe from that photo. Try a clearer or better-lit photo.";
  }
  if (status === 503) {
    return "Photo import isn't available right now.";
  }
  if (status === 413) {
    return "That photo is too large (max 15 MB). Try a smaller or compressed version.";
  }
  return "Something went wrong — please try again.";
}

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
      setExtractError(messageForError(err));
      clearFile();
      setStep("upload");
    }
  }

  if (step === "extracting") {
    return (
      <main className="p-4 sm:p-8 space-y-6">
        <EditorHeader backTo="/" backLabel="Recipes" title="Import from photo" />
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
          title="Import from photo"
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
        title="Import from photo"
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
