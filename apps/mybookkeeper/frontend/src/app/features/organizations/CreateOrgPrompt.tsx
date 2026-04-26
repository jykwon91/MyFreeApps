import { useState } from "react";
import { useCreateOrganizationMutation } from "@/shared/store/organizationsApi";
import LoadingButton from "@/shared/components/ui/LoadingButton";

export default function CreateOrgPrompt() {
  const [name, setName] = useState("");
  const [createOrg, { isLoading, error }] = useCreateOrganizationMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createOrg({ name: name.trim() });
  }

  const errorMessage = error && "data" in error
    ? String((error.data as Record<string, unknown>)?.detail ?? "Something went wrong")
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <div className="bg-card border rounded-lg p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-semibold mb-2">Create your organization</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Get started by creating an organization to manage your bookkeeping.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Organization name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Properties LLC"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          {errorMessage ? <p className="text-destructive text-sm">{errorMessage}</p> : null}
          <LoadingButton type="submit" isLoading={isLoading} loadingText="Creating..." className="w-full">
            Create organization
          </LoadingButton>
        </form>
      </div>
    </div>
  );
}
