import { redirect } from "next/navigation";

export default function OrgSettingsRedirectPage() {
  redirect("/dashboard/settings?tab=org");
}
