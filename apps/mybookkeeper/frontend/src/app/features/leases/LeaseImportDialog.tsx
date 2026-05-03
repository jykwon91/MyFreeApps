import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Button from "@/shared/components/ui/Button";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useGetApplicantsQuery } from "@/shared/store/applicantsApi";
import { useGetListingsQuery } from "@/shared/store/listingsApi";
import { useImportSignedLeaseMutation } from "@/shared/store/signedLeasesApi";

interface Props {
  onClose: () => void;
}

/**
 * Dialog for importing an externally-signed lease PDF.
 *
 * Creates a ``signed_lease`` record with ``kind='imported'`` and attaches the
 * uploaded files. The first file is treated as the signed lease document;
 * subsequent files use a filename heuristic (move-in / move-out inspection →
 * appropriate kind, everything else → signed_addendum).
 */
export default function LeaseImportDialog({ onClose }: Props) {
  const navigate = useNavigate();
  const [importLease, { isLoading }] = useImportSignedLeaseMutation();
  const { data: applicantsData } = useGetApplicantsQuery({ limit: 100 });
  const { data: listingsData } = useGetListingsQuery({ limit: 100 });
  const applicants = applicantsData?.items ?? [];
  const listings = listingsData?.items ?? [];

  const [applicantId, setApplicantId] = useState("");
  const [listingId, setListingId] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValid = applicantId.trim() !== "" && files.length > 0;
  const notesRemaining = 2000 - notes.length;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...selected]);
    // Reset the input so the same file can be re-selected if removed.
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    try {
      const result = await importLease({
        applicant_id: applicantId,
        listing_id: listingId || undefined,
        starts_on: startsOn || undefined,
        ends_on: endsOn || undefined,
        notes: notes || undefined,
        status: "signed",
        files,
      }).unwrap();

      const count = result.attachments.length;
      showSuccess(
        `Lease imported with ${count} ${count === 1 ? "attachment" : "attachments"}.`,
      );
      navigate(`/leases/${result.id}`);
    } catch {
      showError("Couldn't import the lease. Please check the files and try again.");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lease-import-dialog-title"
      data-testid="lease-import-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-5">
          <h2
            id="lease-import-dialog-title"
            className="text-lg font-semibold"
          >
            Import signed lease
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4" data-testid="lease-import-form">
            {/* Applicant */}
            <div className="space-y-1">
              <label
                htmlFor="import-applicant"
                className="block text-sm font-medium"
              >
                Applicant <span className="text-destructive">*</span>
              </label>
              <select
                id="import-applicant"
                value={applicantId}
                onChange={(e) => setApplicantId(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border rounded-md min-h-[44px]"
                data-testid="import-applicant-select"
              >
                <option value="">— select applicant —</option>
                {applicants.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.legal_name ?? `Applicant ${a.id.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Listing (optional) */}
            <div className="space-y-1">
              <label
                htmlFor="import-listing"
                className="block text-sm font-medium"
              >
                Listing{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  (optional)
                </span>
              </label>
              <select
                id="import-listing"
                value={listingId}
                onChange={(e) => setListingId(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md min-h-[44px]"
                data-testid="import-listing-select"
              >
                <option value="">— none —</option>
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Term dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="import-starts-on"
                  className="block text-sm font-medium"
                >
                  Lease starts
                  <span className="text-muted-foreground text-xs font-normal ml-1">
                    (optional)
                  </span>
                </label>
                <input
                  id="import-starts-on"
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-md min-h-[44px]"
                  data-testid="import-starts-on"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="import-ends-on"
                  className="block text-sm font-medium"
                >
                  Lease ends
                  <span className="text-muted-foreground text-xs font-normal ml-1">
                    (optional)
                  </span>
                </label>
                <input
                  id="import-ends-on"
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-md min-h-[44px]"
                  data-testid="import-ends-on"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="import-notes"
                  className="block text-sm font-medium"
                >
                  Notes
                  <span className="text-muted-foreground text-xs font-normal ml-1">
                    (optional)
                  </span>
                </label>
                <span
                  className={`text-xs ${notesRemaining < 100 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {notesRemaining}
                </span>
              </div>
              <textarea
                id="import-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Any context about this lease — signing date, source, etc."
                className="w-full px-3 py-2 text-sm border rounded-md"
                data-testid="import-notes"
              />
            </div>

            {/* File upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">
                Files <span className="text-destructive">*</span>
                <span className="text-muted-foreground text-xs font-normal ml-1">
                  — PDF, DOCX, JPG, PNG, WebP
                </span>
              </label>

              <div
                className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = Array.from(e.dataTransfer.files);
                  setFiles((prev) => [...prev, ...dropped]);
                }}
                onDragOver={(e) => e.preventDefault()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                data-testid="import-file-drop-zone"
              >
                <p className="text-sm text-muted-foreground">
                  Drag and drop files here, or{" "}
                  <span className="text-primary underline">browse</span>
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
                onChange={handleFileChange}
                className="sr-only"
                data-testid="import-file-input"
              />

              {files.length > 0 ? (
                <ul className="space-y-1" data-testid="import-file-list">
                  {files.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center justify-between gap-2 text-sm border rounded px-3 py-1.5"
                    >
                      <span className="truncate">
                        {i === 0 ? (
                          <span className="text-muted-foreground text-xs mr-1">
                            [signed lease]
                          </span>
                        ) : null}
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-destructive hover:underline text-xs shrink-0 min-h-[44px] sm:min-h-0"
                        aria-label={`Remove ${file.name}`}
                        data-testid={`import-remove-file-${i}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {/* Status note */}
            <p className="text-xs text-muted-foreground">
              Status will be set to{" "}
              <span className="font-medium text-foreground">Signed</span> — imported leases are
              already signed.
            </p>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isLoading}
                data-testid="import-cancel"
              >
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                isLoading={isLoading}
                loadingText="Importing..."
                disabled={!isValid}
                data-testid="import-submit"
              >
                Import lease
              </LoadingButton>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
