import type { Metadata } from "next";
import LandingPage from "@/components/landing/LandingPage";
import { SITE_DESCRIPTION, SITE_PREVIEW_TITLE } from "@/lib/seo/constants";
import { homeSocialMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  // `absolute` skips the "%s | Nenjo" template so the home tab/SERP title is
  // descriptive instead of the bare brand name.
  title: { absolute: SITE_PREVIEW_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  ...homeSocialMetadata(SITE_DESCRIPTION),
};

export default function Home() {
  return <LandingPage />;
}