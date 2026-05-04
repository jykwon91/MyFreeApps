import { useEffect, useState } from "react";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import api from "@/shared/lib/api";

interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Lets the host set the display name that appears on rent receipts and
 * outbound emails. Without this, the receipt PDF falls back to the
 * email local-part (e.g. "jasonykwon91"), which is wrong for
 * tenant-facing artifacts.
 */
export default function DisplayNameSetting() {
  const [name, setName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<CurrentUser>("/users/me")
      .then((res) => {
        if (cancelled) return;
        const current = res.data.name ?? "";
        setName(current);
        setOriginalName(current);
      })
      .catch(() => {
        // non-fatal — user can still type a name and save
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const trimmed = name.trim();
      await api.patch("/users/me", { name: trimmed || null });
      setOriginalName(trimmed);
      showSuccess("Display name saved.");
    } catch {
      showError("Couldn't save your name. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const dirty = name.trim() !== originalName;

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">Display name</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          Shown to tenants on rent receipts and outbound emails. Use the
          legal name (or business name) you want tenants to see.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jane Smith"
          disabled={loading}
          className="flex-1 px-3 py-2 text-sm border rounded-md disabled:opacity-50"
          maxLength={120}
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving || !dirty}
          className="px-3 py-2 text-sm font-medium rounded-md border bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 min-h-[44px] sm:min-h-[36px]"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
