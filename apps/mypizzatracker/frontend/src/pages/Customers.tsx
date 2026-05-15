import { useMemo, useState } from "react";
import {
  Card,
  Button,
  LoadingButton,
  Skeleton,
  EmptyState,
  showError,
  showSuccess,
  extractErrorMessage,
} from "@platform/ui";
import { Check, Pencil, Phone, Search, X } from "lucide-react";
import {
  useListCustomersQuery,
  useUpdateCustomerNotesMutation,
} from "@/store/customersApi";
import { useDebouncedValue } from "@/features/public-order/useDebouncedValue";
import type { CustomerListItem } from "@/types/customer/customer";

/**
 * Operator-only customer DB view. Single-screen workflow:
 *   1. Type into the search box to filter (name OR phone digits, debounced).
 *   2. Each row shows name, phone, order count, last-seen date.
 *   3. Notes column is inline-editable -- click pencil to edit, save/cancel
 *      to commit/back out. Saved notes are operator-only ("prefers extra
 *      crispy", "gluten sensitive", "always shows up 20m late").
 *
 * Notes are never shown to the customer -- they live for the operator's
 * own memory and surface here only.
 */
export default function CustomersPage() {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300);

  const query = useListCustomersQuery(
    debouncedSearch ? { search: debouncedSearch } : undefined,
  );

  return (
    <main className="p-4 sm:p-8 space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Everyone who has ever placed an order. Use the notes column to
          remember preferences -- the customer never sees them.
        </p>
      </header>

      <Card>
        <label className="flex items-center gap-2 text-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or phone..."
            className="flex-1 px-3 py-2 rounded border bg-background text-sm"
          />
        </label>
      </Card>

      {query.isLoading ? <ListSkeleton /> : null}

      {query.isError ? (
        <EmptyState
          heading="Could not load customers"
          body={extractErrorMessage(query.error) || "Please try again."}
          action={{ label: "Retry", onClick: () => query.refetch() }}
        />
      ) : null}

      {query.data ? (
        query.data.length === 0 ? (
          <EmptyState
            heading={
              debouncedSearch
                ? `No customers match "${debouncedSearch}"`
                : "No customers yet"
            }
            body={
              debouncedSearch
                ? "Try a different name or phone fragment."
                : "Customers show up here after their first order."
            }
          />
        ) : (
          <CustomerList rows={query.data} />
        )
      ) : null}
    </main>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <Skeleton className="h-4 w-1/3 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </Card>
      ))}
    </div>
  );
}

interface CustomerListProps {
  rows: CustomerListItem[];
}

function CustomerList({ rows }: CustomerListProps) {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <CustomerCard row={row} />
        </li>
      ))}
    </ul>
  );
}

interface CustomerCardProps {
  row: CustomerListItem;
}

function CustomerCard({ row }: CustomerCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftNotes, setDraftNotes] = useState(row.notes ?? "");
  const [updateNotes, { isLoading }] = useUpdateCustomerNotesMutation();

  const formattedPhone = useMemo(() => formatPhone(row.phone), [row.phone]);
  const lastSeen = useMemo(() => formatLastSeen(row.last_order_at), [
    row.last_order_at,
  ]);

  const save = async () => {
    try {
      await updateNotes({
        customerId: row.id,
        body: { notes: draftNotes },
      }).unwrap();
      showSuccess("Notes saved");
      setEditing(false);
    } catch (err) {
      showError(extractErrorMessage(err) || "Could not save notes");
    }
  };

  const cancel = () => {
    setDraftNotes(row.notes ?? "");
    setEditing(false);
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-medium truncate">{row.name}</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Phone className="h-3 w-3" />
            {formattedPhone}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0">
          <div>{row.order_count} order{row.order_count === 1 ? "" : "s"}</div>
          <div>Last: {lastSeen}</div>
        </div>
      </div>

      <div className="mt-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. prefers extra crispy crust"
              className="w-full px-3 py-2 rounded border bg-background text-sm"
            />
            <div className="flex gap-2">
              <LoadingButton
                size="sm"
                isLoading={isLoading}
                loadingText="Saving..."
                onClick={save}
              >
                <Check className="h-4 w-4 mr-1" /> Save
              </LoadingButton>
              <Button size="sm" variant="ghost" onClick={cancel}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground flex-1 whitespace-pre-wrap">
              {row.notes ? row.notes : <em className="text-xs">No notes yet</em>}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraftNotes(row.notes ?? "");
                setEditing(true);
              }}
              aria-label={`Edit notes for ${row.name}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatPhone(digits: string): string {
  // Render US-style 10-digit phones as (XXX) XXX-XXXX; pass anything else through.
  if (/^\d{10}$/.test(digits)) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "never";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
  if (sameDay) return "today";
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString();
}
