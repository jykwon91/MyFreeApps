import { useState } from "react";
import { ConfirmDialog, FormField, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import { useCreateDiscoverySourceMutation } from "@/store/discoverApi";

interface NewSavedSearchDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Dialog for creating a new JSearch saved search.
 *
 * v1 only supports JSearch (Google Jobs aggregator). Other adapters —
 * Greenhouse, Lever, Ashby, RemoteOK, HN — are scaffolded in the
 * backend enum but have no adapters yet. When they ship, this dialog
 * picks up a source dropdown.
 */
export default function NewSavedSearchDialog({
  open,
  onClose,
}: NewSavedSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("us");
  const [datePosted, setDatePosted] = useState<"all" | "today" | "3days" | "week" | "month">("week");
  const [remoteOnly, setRemoteOnly] = useState(false);

  const [createSource, { isLoading }] = useCreateDiscoverySourceMutation();

  function reset() {
    setQuery("");
    setCountry("us");
    setDatePosted("week");
    setRemoteOnly(false);
  }

  async function handleConfirm() {
    const trimmed = query.trim();
    if (!trimmed) {
      showError("Enter a search query");
      return;
    }
    try {
      await createSource({
        source: "jsearch",
        config: {
          query: trimmed,
          country,
          date_posted: datePosted,
          remote_jobs_only: remoteOnly,
        },
      }).unwrap();
      showSuccess("Saved search created");
      reset();
      onClose();
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Failed to create saved search");
    }
  }

  function handleCancel() {
    reset();
    onClose();
  }

  return (
    <ConfirmDialog
      open={open}
      title="New saved search"
      description="JSearch will run this query against Google Jobs (LinkedIn, Indeed, Glassdoor, ZipRecruiter)."
      confirmLabel="Create"
      isLoading={isLoading}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    >
      <div className="space-y-4">
        <FormField label="Search query" required>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='"Senior Backend Engineer" Python'
            className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-1">
            Boolean operators supported. Example: "Senior Backend Engineer" Python remote
          </p>
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Country">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            >
              <option value="us">United States</option>
              <option value="ca">Canada</option>
              <option value="uk">United Kingdom</option>
              <option value="au">Australia</option>
            </select>
          </FormField>

          <FormField label="Posted">
            <select
              value={datePosted}
              onChange={(e) => setDatePosted(e.target.value as typeof datePosted)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
            >
              <option value="today">Past 24 hours</option>
              <option value="3days">Past 3 days</option>
              <option value="week">Past week</option>
              <option value="month">Past month</option>
              <option value="all">Any time</option>
            </select>
          </FormField>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
            className="rounded"
          />
          <span>Remote jobs only</span>
        </label>
      </div>
    </ConfirmDialog>
  );
}
