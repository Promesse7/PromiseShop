"use client";

import { useCallback, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useStoredBoolean } from "@/lib/useStoredBoolean";
import type { EmployeeRole } from "@/lib/types";
import { CommandPalette, useCommandPaletteShortcut } from "./CommandPalette";
import { HelpPanel } from "./HelpPanel";
import { MoreSheet } from "./MoreSheet";
import { PageTitleProvider } from "./PageTitleContext";
import { RouteTransition } from "./RouteTransition";
import { Sidebar } from "./Sidebar";
import { TabBar } from "./TabBar";
import { TopBar } from "./TopBar";
import { useLogout } from "./useLogout";

interface AppShellProps {
  role: EmployeeRole;
  username: string;
  children: ReactNode;
}

const SIDEBAR_KEY = "promiseshop.sidebar.collapsed";

/**
 * The frame around every signed-in page: grouped sidebar (desktop), top bar, phone tab bar
 * with a More sheet, jump search (Ctrl K) and the help panel. Page content animates between
 * routes; the frame itself stays put. Hidden when printing so receipts and labels print alone.
 */
export function AppShell({ role, username, children }: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const [collapsed, setCollapsed] = useStoredBoolean(SIDEBAR_KEY, false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { logout, loggingOut } = useLogout();

  const openSearch = useCallback(() => setSearchOpen(true), []);
  useCommandPaletteShortcut(openSearch);

  return (
    <PageTitleProvider>
    <div className="flex min-h-screen">
      <Sidebar role={role} collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          role={role}
          username={username}
          onOpenSearch={openSearch}
          onOpenHelp={() => setHelpOpen(true)}
          onLogout={logout}
          loggingOut={loggingOut}
        />
        <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 py-4 pb-24 lg:px-6 lg:py-6 lg:pb-6 print:p-0 print:max-w-none">
          <RouteTransition key={pathname}>{children}</RouteTransition>
        </main>
      </div>
      <TabBar role={role} onMore={() => setMoreOpen(true)} />
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        role={role}
        username={username}
        onHelp={() => setHelpOpen(true)}
        onLogout={logout}
        loggingOut={loggingOut}
      />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} role={role} />
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
    </PageTitleProvider>
  );
}
