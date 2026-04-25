import { useSelector, useDispatch } from "react-redux";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Plus, Check } from "lucide-react";
import type { RootState, AppDispatch } from "@/shared/store";
import { switchOrg } from "@/shared/store/organizationSlice";
import { useCurrentOrg } from "@/shared/hooks/useCurrentOrg";
import { useState } from "react";
import { useCreateOrganizationMutation } from "@/shared/store/organizationsApi";

import { ROLE_LABELS } from "@/shared/lib/organization-config";

export default function OrgSwitcher() {
  const dispatch = useDispatch<AppDispatch>();
  const organizations = useSelector((state: RootState) => state.organization.organizations);
  const currentOrg = useCurrentOrg();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [createOrg, { isLoading: creating }] = useCreateOrganizationMutation();

  function handleSwitch(orgId: string) {
    dispatch(switchOrg(orgId));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await createOrg({ name: newName.trim() });
    setNewName("");
    setShowCreate(false);
  }

  if (!currentOrg) return null;

  return (
    <div className="space-y-2">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-md hover:bg-muted transition-colors">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{currentOrg.name}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABELS[currentOrg.org_role]}</div>
            </div>
            <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="z-50 min-w-[200px] bg-card border rounded-lg shadow-lg p-1"
            sideOffset={4}
            align="start"
          >
            {organizations.map((org) => (
              <DropdownMenu.Item
                key={org.id}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer outline-none hover:bg-muted"
                onSelect={() => handleSwitch(org.id)}
              >
                <span className="flex-1 truncate">{org.name}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[org.org_role]}</span>
                {org.id === currentOrg.id ? <Check size={14} className="text-primary shrink-0" /> : null}
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="h-px bg-border my-1" />
            <DropdownMenu.Item
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer outline-none hover:bg-muted text-muted-foreground"
              onSelect={() => setShowCreate(true)}
            >
              <Plus size={14} />
              <span>New organization</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {showCreate ? (
        <form onSubmit={handleCreate} className="space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Organization name"
            className="w-full border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
          <div className="flex gap-1">
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="flex-1 text-xs bg-primary text-primary-foreground rounded px-2 py-1 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {creating ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Creating...
                </>
              ) : "Create"}
            </button>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setNewName(""); }}
              className="text-xs text-muted-foreground hover:underline px-2 py-1"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
