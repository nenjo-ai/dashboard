# Frontend Application

This is the Next.js frontend application with TypeScript and Tailwind CSS.

## Getting Started

First, install dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Artifact previews are streamed through the dashboard server. Set
`ARTIFACT_DOWNLOAD_ORIGINS` to the comma-separated object-store origins that
may appear in platform download grants. Local Garage uses
`http://localhost:3900`. The proxy rejects signed URLs outside this
server-owned allowlist.

Set this variable in Vercel's **Production** environment as well, then redeploy
the dashboard so the deployment picks up the value. Use the exact origin
(scheme, hostname, and optional port), without a bucket path or query string.
The platform uses path-style S3 URLs, so DigitalOcean Spaces deployments use
the origin of `NEN__S3__ENDPOINT` (Terraform output `spaces_endpoint`), for
example `https://nyc3.digitaloceanspaces.com`, rather than the bucket's domain.
Only include the storage endpoints used by your deployment.

`Artifact storage is not configured for previews` means the allowlist is missing
or malformed. `Artifact download URL is invalid` means the platform-issued URL
is malformed or its origin does not match the configured allowlist. Compare
origins only when troubleshooting; do not copy signed download URLs into logs.

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Local authentication

Browser automation and UI development can use a stable local identity without
signing in to Clerk:

```bash
npm run dev:local-auth
```

This mode binds Next.js to `127.0.0.1` and is rejected when `NODE_ENV` is
`production`. It still sends every platform request through the dashboard BFF,
which signs the normal short-lived internal JWT. Platform user, organization,
scope, and tenant authorization therefore remain enabled.

The dashboard and platform must have their existing matching internal-auth
shared secret configuration:

```text
dashboard: DASHBOARD_PLATFORM_SHARED_SECRET
platform:  NEN__INTERNAL_AUTH__ENABLED=true
platform:  NEN__INTERNAL_AUTH__SHARED_SECRET
```

The optional local profile settings are server-owned and never accepted from
browser headers or query parameters:

```text
NENJO_LOCAL_AUTH_SUBJECT=local_dev
NENJO_LOCAL_AUTH_NAME=Local Developer
NENJO_LOCAL_AUTH_EMAIL=local@nenjo.dev
```

Keep the subject stable: it is also the browser vault account identifier and
the platform external user identifier. Clerk remains the default whenever
`NENJO_AUTH_MODE` is unset.

Fresh local identities enter the same onboarding flow as Clerk identities. To
exercise onboarding again, use a new subject and email together because both
the external subject and email participate in platform user provisioning:

```bash
NENJO_LOCAL_AUTH_SUBJECT=onboarding_dev_001 \
NENJO_LOCAL_AUTH_EMAIL=onboarding_dev_001@nenjo.dev \
npm run dev:local-auth
```

## Project Structure

- `/app` - Next.js 13+ app directory with routing
  - `/dashboard` - Protected dashboard routes
  - `layout.tsx` - Root layout
  - `page.tsx` - Home page
- `tailwind.config.ts` - Tailwind configuration with PRD theme colors
- `tsconfig.json` - TypeScript configuration

## Theme Colors

The following theme colors are configured in Tailwind:
- `deep-space-blue` - Primary brand color
- `flag-red` - Alert/error color
- `vivid-tangerine` - Accent color
- `sunflower-gold` - Warning/highlight color
- `vanilla-custard` - Light background color

## Next Steps

1. Integrate Clerk authentication
2. Connect to backend APIs
3. Implement protected routes
4. Add real dashboard functionality
