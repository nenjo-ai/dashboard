import { redirect } from "next/navigation";

export default function CouncilsPage() {
  redirect("/dashboard/routines?tab=councils");
}
