import { useState } from "react";
import { X } from "lucide-react";
import {
  useGetPropertiesQuery,
  useCreatePropertyMutation,
  useUpdatePropertyMutation,
  useDeletePropertyMutation,
} from "@/shared/store/propertiesApi";
import type { PropertyForm } from "@/shared/types/property/property-form";
import { useToast } from "@/shared/hooks/useToast";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Select from "@/shared/components/ui/Select";
import TilePicker from "@/shared/components/ui/TilePicker";
import FormField from "@/shared/components/ui/FormField";
import SectionHeader from "@/shared/components/ui/SectionHeader";
import ConfirmDialog from "@/shared/components/ui/ConfirmDialog";
import AlertBox from "@/shared/components/ui/AlertBox";
import type { PropertyClassification } from "@/shared/types/property/property-classification";
import { CLASSIFICATION_OPTIONS } from "@/shared/lib/property-labels";
import { blankForm, addressComplete, toAddress } from "@/app/features/properties/propertyForm";
import AddressInputs from "@/app/features/properties/AddressInputs";
import PropertyEditCard from "@/app/features/properties/PropertyEditCard";
import PropertyListItem from "@/app/features/properties/PropertyListItem";
import PropertiesSkeleton from "@/app/features/properties/PropertiesSkeleton";
import EmptyState from "@/shared/components/ui/EmptyState";
import { useCanWrite } from "@/shared/hooks/useOrgRole";
import { useDismissable } from "@/shared/hooks/useDismissable";

export default function Properties() {
  const canWrite = useCanWrite();
  const { dismissed: infoDismissed, dismiss: dismissInfo } = useDismissable("props-info-dismissed");
  const [form, setForm] = useState<PropertyForm>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { showSuccess, showError } = useToast();

  const { data: properties = [], isLoading } = useGetPropertiesQuery();
  const [createProperty, { isLoading: isCreating }] = useCreatePropertyMutation();
  const [updateProperty] = useUpdatePropertyMutation();
  const [deleteProperty, { isLoading: isDeletePending }] = useDeletePropertyMutation();

  const deleteTarget = confirmDeleteId ? properties.find((p) => p.id === confirmDeleteId) : null;

  function handleToggleActive(id: string, active: boolean) {
    updateProperty({ id, data: { is_active: active } })
      .unwrap()
      .catch((err) => showError(extractErrorMessage(err)));
  }

  function setField(field: keyof PropertyForm, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setClassification(value: PropertyClassification) {
    setForm((prev) => ({
      ...prev,
      classification: value,
      type: value === "investment" ? (prev.type ?? "short_term") : null,
    }));
  }

  function handleCreate() {
    createProperty({
      name: form.name,
      address: toAddress(form),
      classification: form.classification,
      ...(form.type ? { type: form.type } : {}),
    })
      .unwrap()
      .then(() => {
        setForm(blankForm());
        showSuccess("Property created");
      })
      .catch((err) => showError(extractErrorMessage(err)));
  }

  function handleConfirmDelete() {
    if (!confirmDeleteId) return;
    deleteProperty(confirmDeleteId)
      .unwrap()
      .then(() => {
        setConfirmDeleteId(null);
        showSuccess("Property deleted");
      })
      .catch((err) => showError(extractErrorMessage(err)));
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <SectionHeader title="Properties" />

      {!infoDismissed && (
        <AlertBox variant="info" className="flex items-center justify-between gap-3">
          <span>
            Properties let me know where each expense belongs. Assigning a property to a transaction tells me whether to put it on Schedule E (rental) or Schedule A (personal home).
          </span>
          <button
            onClick={dismissInfo}
            aria-label="Dismiss"
            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-800 dark:text-blue-200 shrink-0"
          >
            <X size={14} />
          </button>
        </AlertBox>
      )}

      {canWrite ? (
        <section className="border rounded-lg p-4 space-y-4">
          <FormField label="Property name">
            <input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="e.g. Beach House Unit A"
            />
          </FormField>
          <AddressInputs form={form} onChange={setField} />
          <FormField label="Classification">
            <TilePicker
              options={CLASSIFICATION_OPTIONS}
              value={form.classification}
              onChange={(v) => setClassification(v as PropertyClassification)}
              columns={2}
            />
          </FormField>
          {form.classification === "investment" && (
            <FormField label="Rental type">
              <Select value={form.type ?? "short_term"} onChange={(e) => setField("type", e.target.value)}>
                <option value="short_term">Short-Term Rental</option>
                <option value="long_term">Long-Term Rental</option>
              </Select>
            </FormField>
          )}
          <div className="flex justify-end">
            <LoadingButton
              onClick={handleCreate}
              disabled={!form.name || !addressComplete(form)}
              isLoading={isCreating}
              loadingText="Adding..."
            >
              Add property
            </LoadingButton>
          </div>
        </section>
      ) : null}

      {!isLoading && properties.some((p) => p.classification === "unclassified") && (
        <AlertBox variant="warning">
          I found some properties that still need to be classified. Can you take a moment to let me know if they are rental investments or personal homes? This helps me put your expenses on the right tax forms.
        </AlertBox>
      )}

      {isLoading ? (
        <PropertiesSkeleton />
      ) : (
        <ul className="space-y-2">
          {properties.map((property) =>
            canWrite && editingId === property.id ? (
              <li key={property.id}>
                <PropertyEditCard property={property} onDone={() => setEditingId(null)} />
              </li>
            ) : (
              <li key={property.id}>
                <PropertyListItem
                  property={property}
                  onEdit={() => setEditingId(property.id)}
                  onDelete={() => setConfirmDeleteId(property.id)}
                  onToggleActive={handleToggleActive}
                  canWrite={canWrite}
                />
              </li>
            )
          )}
          {properties.length === 0 && (
            <li><EmptyState message="Add your first property above — I'll use it to organize your transactions and put expenses on the right tax forms." /></li>
          )}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete property"
        description={`Are you sure you want to delete ${deleteTarget?.name ?? "this property"}? Documents linked to this property will lose their property assignment.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={isDeletePending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </main>
  );
}
