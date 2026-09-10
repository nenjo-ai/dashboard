import { notFound } from "next/navigation";
import { McpServersSection } from "@/components/settings/McpServersSection";

export const dynamic = "force-dynamic";

export default function McpRegistryHarnessPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ENABLE_BROWSER_HARNESS !== "1") {
    notFound();
  }
  return <main className="mx-auto max-w-6xl p-6"><McpServersSection /></main>;
}
