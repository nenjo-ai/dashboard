import type { Metadata } from "next";
import InvitationAcceptClient from "./InvitationAcceptClient";

export const metadata: Metadata = {
  title: "Org invitation",
  description: "Review and accept a Nenjo organization invitation.",
  robots: { index: false, follow: false, nocache: true },
};

export default function InvitationAcceptPage() {
  return <InvitationAcceptClient />;
}
