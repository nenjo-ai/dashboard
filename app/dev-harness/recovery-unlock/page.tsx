import { notFound } from "next/navigation";
import { RecoveryUnlockHarnessClient } from "./RecoveryUnlockHarnessClient";

export const dynamic = "force-dynamic";

export default function RecoveryUnlockHarnessPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_ENABLE_BROWSER_HARNESS !== "1"
  ) {
    notFound();
  }

  return <RecoveryUnlockHarnessClient />;
}
