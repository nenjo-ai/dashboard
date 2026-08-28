import { Compass, Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { PageIntro } from "@/components/ui/PageIntro";
import type { PackageHubTab } from "@/lib/packageHub";

export function PackageHubHeader({
  activeTab,
  installedCount,
  sourceCount,
  catalogCount,
  onBrowse,
  onAdd,
}: {
  activeTab: PackageHubTab;
  installedCount: number;
  sourceCount: number;
  catalogCount: number;
  onBrowse: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-4">
      <PageIntro
        eyebrow="Package ecosystem"
        description="Discover and manage reusable agents, abilities, knowledge, and integrations for this organization."
        actions={
          <>
            {activeTab === "installed" ? (
              <Button variant="secondary" onClick={onBrowse}>
                <Compass className="h-4 w-4" />
                Discover packages
              </Button>
            ) : null}
            <Button onClick={onAdd}>
              <Plus className="h-4 w-4" />
              Add package
            </Button>
          </>
        }
        className="mb-0"
      />
      <div
        className="theme-surface theme-border flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border px-4 py-3 text-xs"
        aria-label="Package summary"
      >
        <SummaryItem label="Installed" value={installedCount} />
        <SummaryItem label="Sources" value={sourceCount} />
        {catalogCount ? <SummaryItem label="Discovered" value={catalogCount} /> : null}
        <span className="theme-text-muted ml-auto hidden sm:inline">
          Organization package workspace
        </span>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <strong className="theme-text text-sm font-semibold tabular-nums">{value}</strong>
      <span className="theme-text-muted">{label.toLocaleLowerCase()}</span>
    </span>
  );
}
