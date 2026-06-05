import type { ReactNode } from "react";

import { BackgroundField } from "@/components/background-field";
import { BottomTabBar } from "@/components/shell/bottom-tab-bar";
import { TopNav } from "@/components/shell/top-nav";

export function AppShell({
  groupName,
  children,
}: {
  groupName: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <BackgroundField />
      <TopNav groupName={groupName} />
      {/* pb-28 leaves room for the floating mobile tab bar */}
      <main className="mx-auto max-w-4xl px-4 py-6 pb-28 md:pb-6">{children}</main>
      <BottomTabBar />
    </div>
  );
}
