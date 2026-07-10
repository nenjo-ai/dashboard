import { redirect } from "next/navigation";

export default async function InvitationAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/dashboard/invitations?token=${encodeURIComponent(token)}`);
}
