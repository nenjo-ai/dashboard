import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";

const HOME_DESCRIPTION =
  "Nenjo is a private, collaborative, open-source platform for building and running teams of AI agents. Fully managed, with everything encrypted client-side — so not even Nenjo can read your data.";

export const metadata: Metadata = {
  // `absolute` skips the "%s | Nenjo" template so the home tab/SERP title is
  // descriptive instead of the bare brand name.
  title: { absolute: "Nenjo — The private, collaborative agentic workspace" },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
};

export default function Home() {
  return <LandingPage />;
}