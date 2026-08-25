"use client";

import { Files, LayoutDashboard, Network } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Tabs } from "@/components/ui/Tabs";

const LIBRARY_TABS = [
  {
    id: "overview",
    label: "Overview",
    href: "/dashboard/library",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    id: "graphs",
    label: "Knowledge Graphs",
    href: "/dashboard/library/graphs",
    icon: <Network className="h-4 w-4" />,
  },
  {
    id: "artifacts",
    label: "Artifacts",
    href: "/dashboard/library/artifacts",
    icon: <Files className="h-4 w-4" />,
  },
] as const;

export function LibraryTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const activeTab = pathname.startsWith("/dashboard/library/artifacts")
    ? "artifacts"
    : pathname.startsWith("/dashboard/library/graphs")
      ? "graphs"
      : "overview";

  return (
    <Tabs
      tabs={[...LIBRARY_TABS]}
      activeTab={activeTab}
      onChange={(id) => {
        const tab = LIBRARY_TABS.find((candidate) => candidate.id === id);
        if (tab) router.push(tab.href);
      }}
      layoutId="library-section-tab-indicator"
    />
  );
}
