"use client";

import { BookOpen, Files } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Tabs } from "@/components/ui/Tabs";

const LIBRARY_TABS = [
  {
    id: "knowledge",
    label: "Knowledge Packs",
    href: "/dashboard/library",
    icon: <BookOpen className="h-4 w-4" />,
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
    : "knowledge";

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
