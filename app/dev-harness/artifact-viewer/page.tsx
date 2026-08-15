import { notFound } from "next/navigation";

import { ArtifactViewerHarnessClient } from "./ArtifactViewerHarnessClient";

export const dynamic = "force-dynamic";

export default function ArtifactViewerHarnessPage() {
  if (
    process.env.NODE_ENV === "production"
    && process.env.NEXT_PUBLIC_ENABLE_BROWSER_HARNESS !== "1"
  ) {
    notFound();
  }

  return <ArtifactViewerHarnessClient />;
}
