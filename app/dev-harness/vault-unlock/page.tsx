import { notFound } from "next/navigation";
import { VaultUnlockHarnessClient } from "./VaultUnlockHarnessClient";

export const dynamic = "force-dynamic";

export default function VaultUnlockHarnessPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_ENABLE_BROWSER_HARNESS !== "1"
  ) {
    notFound();
  }

  return <VaultUnlockHarnessClient />;
}
