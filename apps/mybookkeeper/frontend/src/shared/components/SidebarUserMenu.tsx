import { NavLink } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronUp, LogOut, Settings } from "lucide-react";
import { logout } from "@/shared/lib/auth";
import type { UserProfile } from "@/shared/types/user/user";

interface SidebarUserMenuProps {
  user: UserProfile;
  /** Adds an "Admin" item linking to the admin portal. */
  showAdminLink: boolean;
  /** Called when an item navigates away, so a slide-in sidebar can close. */
  onNavigate: () => void;
}

const ITEM_CLASSES =
  "flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground outline-none cursor-pointer hover:bg-muted data-[highlighted]:bg-muted";

export default function SidebarUserMenu({ user, showAdminLink, onNavigate }: SidebarUserMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="group w-full flex items-center justify-between px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium shrink-0">
              {(user.name || user.email)[0].toUpperCase()}
            </div>
            <div className="min-w-0 text-left">
              <div className="text-xs font-medium truncate">{user.name || user.email.split("@")[0]}</div>
              <div className="text-xs text-muted-foreground capitalize">{user.role}</div>
            </div>
          </div>
          <ChevronUp
            size={14}
            aria-hidden="true"
            className="text-muted-foreground transition-transform rotate-180 group-data-[state=open]:rotate-0"
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={4}
          className="z-[60] w-[var(--radix-dropdown-menu-trigger-width)] bg-card border rounded-md shadow-lg py-1"
        >
          {showAdminLink && (
            <DropdownMenu.Item asChild>
              <NavLink to="/admin" onClick={onNavigate} className={ITEM_CLASSES}>
                <Settings size={14} aria-hidden="true" />
                Admin
              </NavLink>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item onSelect={logout} className={ITEM_CLASSES}>
            <LogOut size={14} aria-hidden="true" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
