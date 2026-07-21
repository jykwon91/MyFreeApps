import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Mail, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import AlertBox from "@/shared/components/ui/AlertBox";
import Markdown from "@/shared/components/ui/Markdown";
import { Button, LoadingButton } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  NEW_SECTION_DEFAULT_TITLE,
  WELCOME_MANUAL_VIEW_MODE,
  type WelcomeManualViewMode,
} from "@/shared/lib/welcome-manual-constants";
import {
  useCreateSectionMutation,
  useDeleteWelcomeManualMutation,
  useGetWelcomeManualByIdQuery,
} from "@/shared/store/welcomeManualsApi";
import { useGetPropertiesQuery } from "@/shared/store/propertiesApi";
import type { WelcomeManualSectionResponse } from "@/shared/types/welcome-manual/welcome-manual-section-response";
import WelcomeManualDetailSkeleton from "@/app/features/welcome-manuals/WelcomeManualDetailSkeleton";
import WelcomeManualSectionCard from "@/app/features/welcome-manuals/WelcomeManualSectionCard";
import WelcomeManualPreview from "@/app/features/welcome-manuals/WelcomeManualPreview";
import WelcomeManualPlaceManager from "@/app/features/welcome-manuals/WelcomeManualPlaceManager";
import WelcomeManualShareCard from "@/app/features/welcome-manuals/WelcomeManualShareCard";
import WelcomeManualForm from "@/app/features/welcome-manuals/WelcomeManualForm";
import WelcomeManualEmailDialog from "@/app/features/welcome-manuals/WelcomeManualEmailDialog";
import DeleteWelcomeManualModal from "@/app/features/welcome-manuals/DeleteWelcomeManualModal";
import { useWelcomeManualSectionOrder } from "@/app/features/welcome-manuals/useWelcomeManualSectionOrder";

export default function WelcomeManualDetail() {
  const { manualId } = useParams<{ manualId: string }>();
  const navigate = useNavigate();
  const [showEditForm, setShowEditForm] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  // Mobile-only view toggle. Desktop (lg+) shows editor + preview side by side,
  // so this state is ignored there.
  const [mobileView, setMobileView] = useState<WelcomeManualViewMode>(
    WELCOME_MANUAL_VIEW_MODE.EDIT,
  );

  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  const [createSection, { isLoading: isAddingSection }] = useCreateSectionMutation();
  const [deleteManual, { isLoading: isDeleting }] = useDeleteWelcomeManualMutation();

  const {
    data: manual,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useGetWelcomeManualByIdQuery(manualId ?? "", { skip: !manualId });
  const { data: properties = [] } = useGetPropertiesQuery();

  const sections = manual?.sections ?? [];
  const sortedSections = [...sections].sort((a, b) => a.display_order - b.display_order);
  const property = manual?.property_id
    ? properties.find((p) => p.id === manual.property_id)
    : undefined;

  const { orderedIds, handleDragEnd } = useWelcomeManualSectionOrder({
    manualId: manual?.id ?? "",
    sections,
  });

  const sectionsById = new Map<string, WelcomeManualSectionResponse>(
    sortedSections.map((s) => [s.id, s]),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const registerSectionRef = useCallback((id: string, node: HTMLElement | null) => {
    if (node) {
      sectionRefs.current.set(id, node);
    } else {
      sectionRefs.current.delete(id);
    }
  }, []);

  // After a new section is added and the manual refetches, scroll the new card
  // into view and focus its title input.
  useEffect(() => {
    if (!pendingFocusId) return;
    const node = sectionRefs.current.get(pendingFocusId);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    const titleInput = node.querySelector<HTMLInputElement>(
      '[data-testid="welcome-manual-section-title"]',
    );
    titleInput?.focus();
    setPendingFocusId(null);
  }, [pendingFocusId, sortedSections.length]);

  async function handleAddSection() {
    if (!manual) return;
    try {
      const created = await createSection({
        manualId: manual.id,
        data: { title: NEW_SECTION_DEFAULT_TITLE },
      }).unwrap();
      setPendingFocusId(created.id);
    } catch {
      showError("I couldn't add a section. Want to try again?");
    }
  }

  async function handleConfirmDelete() {
    if (!manual) return;
    try {
      await deleteManual(manual.id).unwrap();
      showSuccess("Welcome manual deleted.");
      setShowDeleteModal(false);
      navigate("/welcome-manuals");
    } catch {
      showError("I couldn't delete that manual. Want to try again?");
    }
  }

  const hasSections = sortedSections.length > 0;

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-[96rem]">
      <Link
        to="/welcome-manuals"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to welcome manuals
      </Link>

      {isError ? (
        <AlertBox variant="error" className="flex items-center justify-between gap-3">
          <span>I couldn't load this welcome manual. Want me to try again?</span>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isFetching}
            loadingText="Retrying..."
            onClick={() => refetch()}
          >
            Retry
          </LoadingButton>
        </AlertBox>
      ) : null}

      {isLoading && !isError ? <WelcomeManualDetailSkeleton /> : null}

      {manual ? (
        <>
          <div
            className="flex rounded-lg border p-1 lg:hidden"
            role="tablist"
            aria-label="Editor and guest preview"
            data-testid="welcome-manual-view-toggle"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mobileView === WELCOME_MANUAL_VIEW_MODE.EDIT}
              onClick={() => setMobileView(WELCOME_MANUAL_VIEW_MODE.EDIT)}
              className={`flex-1 min-h-[44px] rounded-md text-sm font-medium transition-colors ${
                mobileView === WELCOME_MANUAL_VIEW_MODE.EDIT
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="welcome-manual-view-toggle-edit"
            >
              Edit
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileView === WELCOME_MANUAL_VIEW_MODE.PREVIEW}
              onClick={() => setMobileView(WELCOME_MANUAL_VIEW_MODE.PREVIEW)}
              className={`flex-1 min-h-[44px] rounded-md text-sm font-medium transition-colors ${
                mobileView === WELCOME_MANUAL_VIEW_MODE.PREVIEW
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="welcome-manual-view-toggle-preview"
            >
              Preview
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div
              className={`space-y-6 lg:block ${
                mobileView === WELCOME_MANUAL_VIEW_MODE.EDIT ? "block" : "hidden"
              }`}
              data-testid="welcome-manual-editor-column"
            >
              <section
                className="border rounded-lg p-4 space-y-3"
                data-testid="welcome-manual-header-card"
              >
                <SectionHeader
                  title={manual.title}
                  subtitle={
                    property ? (
                      <Link to="/properties" className="text-sm text-primary hover:underline">
                        {property.name}
                      </Link>
                    ) : undefined
                  }
                  actions={
                    <>
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={() => setShowEditForm(true)}
                        data-testid="edit-welcome-manual-button"
                      >
                        Edit
                      </Button>
                      <span title={hasSections ? undefined : "Add at least one section before sending."}>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => setShowEmailDialog(true)}
                          disabled={!hasSections}
                          data-testid="email-welcome-manual-button"
                        >
                          <Mail className="h-4 w-4 mr-1" />
                          Email to guest
                        </Button>
                      </span>
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={() => setShowDeleteModal(true)}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        data-testid="delete-welcome-manual-button"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </>
                  }
                />
                {manual.intro_text ? (
                  <div data-testid="welcome-manual-intro">
                    <Markdown content={manual.intro_text} />
                  </div>
                ) : null}
              </section>

              <WelcomeManualShareCard
                manualId={manual.id}
                shareToken={manual.share_token}
                sharePin={manual.share_pin}
              />

              {hasSections ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => void handleDragEnd(event)}
                >
                  <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-4" data-testid="welcome-manual-sections">
                      {orderedIds.map((id) => {
                        const section = sectionsById.get(id);
                        if (!section) return null;
                        return (
                          <WelcomeManualSectionCard
                            key={id}
                            ref={(node) => registerSectionRef(id, node)}
                            manualId={manual.id}
                            section={section}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <p
                  className="text-sm text-muted-foreground border rounded-lg p-6 text-center"
                  data-testid="welcome-manual-sections-empty"
                >
                  No sections yet. Add one to start building this guide.
                </p>
              )}

              <div className="flex justify-center">
                <LoadingButton
                  variant="secondary"
                  onClick={() => void handleAddSection()}
                  isLoading={isAddingSection}
                  loadingText="Adding..."
                  data-testid="add-welcome-manual-section-button"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add section
                </LoadingButton>
              </div>

              <section
                className="border rounded-lg p-4 space-y-3 bg-card"
                data-testid="welcome-manual-places-card"
              >
                <WelcomeManualPlaceManager manualId={manual.id} places={manual.places ?? []} />
              </section>
            </div>

            <div
              className={`lg:block ${
                mobileView === WELCOME_MANUAL_VIEW_MODE.PREVIEW ? "block" : "hidden"
              }`}
              data-testid="welcome-manual-preview-column"
            >
              <div className="lg:sticky lg:top-8 space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Guest preview
                </p>
                <WelcomeManualPreview
                  title={manual.title}
                  introText={manual.intro_text}
                  sections={sortedSections}
                  places={manual.places ?? []}
                />
              </div>
            </div>
          </div>

          {showEditForm ? (
            <WelcomeManualForm
              manual={manual}
              properties={properties}
              onClose={() => setShowEditForm(false)}
              onUpdated={() => setShowEditForm(false)}
            />
          ) : null}

          {showEmailDialog ? (
            <WelcomeManualEmailDialog
              manualId={manual.id}
              onClose={() => setShowEmailDialog(false)}
            />
          ) : null}

          <DeleteWelcomeManualModal
            open={showDeleteModal}
            manualTitle={manual.title}
            isLoading={isDeleting}
            onConfirm={handleConfirmDelete}
            onCancel={() => setShowDeleteModal(false)}
          />
        </>
      ) : null}
    </main>
  );
}
