import InvitationAcceptClient from "./InvitationAcceptClient";

export default async function InvitationAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InvitationAcceptClient token={token} />;
}
