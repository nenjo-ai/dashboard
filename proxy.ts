import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require authentication
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
]);

// Routes that are always public (login, onboarding handled by Clerk)
const isPublicRoute = createRouteMatcher([
  "/",
  "/dashboard/login(.*)",
  "/dashboard/invitations(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

// Only enable Clerk middleware if the publishable key is configured
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function noopMiddleware(_req: NextRequest) {
  return NextResponse.next();
}

export default clerkKey
  ? clerkMiddleware(async (auth, req) => {
      // If the route is protected and user is not signed in, redirect to login
      if (isProtectedRoute(req) && !isPublicRoute(req)) {
        await auth.protect();
      }
    })
  : noopMiddleware;

export const config = {
  // Match all routes except static files and Next.js internals
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
