import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isLoopbackHostname,
  resolveDashboardAuthConfig,
} from "@/lib/authMode";

// Routes that require authentication
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
]);

// Routes that are always public (login, onboarding handled by Clerk)
const isPublicRoute = createRouteMatcher([
  "/",
  "/dashboard/login(.*)",
  "/dashboard/signup(.*)",
  "/dashboard/invitations(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const authConfig = resolveDashboardAuthConfig(process.env);

function noopMiddleware(_req: NextRequest) {
  return NextResponse.next();
}

function localAuthMiddleware(req: NextRequest) {
  if (!isLoopbackHostname(req.nextUrl.hostname)) {
    return NextResponse.json(
      {
        error: {
          code: "local_auth_requires_loopback",
          message: "Local authentication is only available through a loopback hostname",
        },
      },
      { status: 403 },
    );
  }
  return NextResponse.next();
}

const dashboardProxy =
  authConfig.kind === "clerk"
    ? clerkMiddleware(async (auth, req) => {
        // If the route is protected and user is not signed in, redirect to login
        if (isProtectedRoute(req) && !isPublicRoute(req)) {
          await auth.protect();
        }
      })
    : authConfig.kind === "local"
      ? localAuthMiddleware
      : noopMiddleware;

export default dashboardProxy;

export const config = {
  // Match all routes except static files and Next.js internals
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
