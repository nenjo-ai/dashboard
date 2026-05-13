import type { Metadata } from "next";
import Link from "next/link";
import { NenjoLogoMark } from "@/components/layout/NenjoLogoMark";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Nenjo privacy policy.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fb] px-6 py-10 text-gray-900 dark:bg-[#05070f] dark:text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-3 transition-colors hover:text-[#b8841a]"
          >
            <NenjoLogoMark className="h-10 w-10 rounded-lg" />
            <span className="text-sm font-light uppercase tracking-[0.25em]">
              Nenjo
            </span>
          </Link>
          <Link
            href="/terms"
            className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            Terms of Service
          </Link>
        </header>

        <article className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
            Legal
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Boon Labs LLC
          </p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Effective Date: May 9, 2026
            <br />
            Last Updated: May 9, 2026
          </p>

          <div className="mt-8 space-y-8 text-sm leading-7 text-gray-700 dark:text-gray-300">
            <p>
              Boon Labs LLC (&ldquo;Boon Labs,&rdquo; &ldquo;Nenjo,&rdquo;
              &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates
              the Nenjo platform at nenjo.ai. Nenjo is a modular agentic
              workflow platform that enables users to define and run portable
              AI agents, abilities, routines, councils, tasks, and related
              resources using manifests.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, disclose, and
              protect your information when you use our Service.
            </p>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                1. Our Privacy Architecture
              </h2>
              <p className="mt-2">
                Nenjo is built with a privacy-first design:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>
                  Agent prompts, documents, context blocks, memories, and
                  execution data are fully encrypted before leaving your
                  control.
                </li>
                <li>
                  The Nenjo platform never has access to plaintext content. We
                  only store and process encrypted manifests and encrypted
                  encryption recovery bundles, along with minimal non-sensitive
                  metadata (resource IDs, ownership, timestamps, and
                  configuration settings).
                </li>
                <li>
                  Decryption occurs only in your approved browser or your own
                  self-hosted AI workers after you explicitly authorize them.
                  Our backend cannot decrypt your content.
                </li>
                <li>
                  You run your own AI workers. All plaintext processing and AI
                  model inference happens under your control using your own API
                  keys.
                </li>
                <li>We do not store IP addresses.</li>
                <li>
                  We do not sell or share your data with third parties for their
                  own purposes.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                2. Information We Collect
              </h2>
              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                Account &amp; Metadata
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Email address (provided through our authentication provider).</li>
                <li>
                  Resource metadata such as project, agent, and routine names,
                  IDs, ownership, platform scopes (applied to agents),
                  timestamps, and configuration settings.
                </li>
                <li>We do not store passwords on our backend.</li>
              </ul>

              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                Push Notification Data
              </h3>
              <p className="mt-2">
                When you enable push notifications from your agents through the
                installed PWA, we collect and store your browser&rsquo;s push
                subscription (including the push endpoint and encryption keys).
                This allows us to send notifications from agents you have
                authorized. You can disable push notifications at any time
                through your browser settings or within the application.
              </p>

              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                Encrypted Content
              </h3>
              <p className="mt-2">
                We store only encrypted versions of your manifests, prompts,
                documents, context blocks, routines, tasks, and encryption
                recovery bundles. We cannot read this content.
              </p>

              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                Usage Data
              </h3>
              <p className="mt-2">
                Basic usage information required to operate and improve the
                platform. We do not store IP addresses.
              </p>

              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                Cookies &amp; Tracking
              </h3>
              <p className="mt-2">
                We use cookies and similar technologies from Vercel for
                essential site functionality and basic analytics.
              </p>

              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                Information from User-Initiated Actions
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Git repositories or MCP servers you choose to connect.</li>
                <li>
                  Email invites you (as an organization owner) choose to send.
                </li>
                <li>
                  Security notifications sent when you approve a new browser or
                  device for decryption access.
                </li>
              </ul>

              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                Information from Your AI Workers
              </h3>
              <p className="mt-2">
                When you connect your own AI worker via NATS, the platform only
                exchanges metadata and encrypted payloads. Plaintext content
                remains inside your worker.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                3. Authentication
              </h2>
              <p className="mt-2">
                We use Clerk as our authentication provider for all sign-in
                operations, including email + password and Google/GitHub SSO.
                Clerk securely manages authentication and passwords. Our backend
                only receives and stores your email address after successful
                authentication. Passwords are never stored on our systems.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                4. How We Use Your Information
              </h2>
              <p className="mt-2">
                We use the information we collect to:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>
                  Provide and operate the Nenjo platform, including
                  authentication, manifest storage, resource management, and
                  coordination with your AI workers.
                </li>
                <li>
                  Enable organization features and collaborator invites
                  (initiated by you).
                </li>
                <li>
                  Send transactional and security-related emails, including
                  organization invites and notifications when you approve a new
                  browser or device.
                </li>
                <li>
                  Send push notifications from agents when you have enabled this
                  feature.
                </li>
                <li>Improve the platform using aggregated, anonymized data.</li>
                <li>Maintain security and comply with legal obligations.</li>
              </ul>
              <p className="mt-3">
                We cannot and do not use your agent prompts, documents, or
                execution content for any purpose because we never have access
                to the plaintext.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                5. How We Share Information
              </h2>
              <p className="mt-2">
                We share information only in these limited circumstances:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    Service Providers
                  </span>{" "}
                  - We use the following providers, who receive only the
                  minimum data necessary:
                  <ul className="mt-2 list-disc space-y-2 pl-5">
                    <li>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        Clerk
                      </span>{" "}
                      - for authentication and user identity management.
                    </li>
                    <li>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        Digital Ocean
                      </span>{" "}
                      - for infrastructure and backend hosting.
                    </li>
                    <li>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        Resend
                      </span>{" "}
                      - for transactional and security emails (organization
                      invites and new device approval notifications) that are
                      triggered by your actions.
                    </li>
                    <li>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        Vercel
                      </span>{" "}
                      - for site functionality and analytics.
                    </li>
                  </ul>
                </li>
                <li>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    User-Directed Sharing
                  </span>{" "}
                  - When you invite collaborators, connect a git repository,
                  register an MCP server, or approve a new browser/device,
                  information is shared only as you direct.
                </li>
                <li>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    Legal Requirements
                  </span>{" "}
                  - If required by valid legal process.
                </li>
                <li>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    Business Transfers
                  </span>{" "}
                  - In the event of a merger, acquisition, or asset sale (with
                  notice).
                </li>
              </ul>
              <p className="mt-3 font-semibold text-gray-900 dark:text-white">
                We do not sell your personal information.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                6. Push Notifications
              </h2>
              <p className="mt-2">
                When you enable push notifications for your agents through the
                installed Progressive Web App (PWA), we use the Web Push API
                with VAPID keys to deliver notifications directly from our
                servers. We store your push subscription details only for as
                long as you have push notifications enabled for one or more
                agents. You can disable push notifications at any time through
                your browser settings or within the Nenjo application. We do not
                use any third-party push notification services for delivery.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                7. Your AI Workers and Local Execution
              </h2>
              <p className="mt-2">
                You control and run your own AI workers. All decryption of your
                content and all calls to AI models (using your own API keys)
                occur inside infrastructure you manage. The Nenjo platform only
                coordinates using metadata and encrypted payloads.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                8. Your Rights and Choices
              </h2>
              <p className="mt-2">You can:</p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Access and update your account information</li>
                <li>
                  Create, modify, and delete projects, agents, routines, and
                  other resources (deletions are processed instantly)
                </li>
                <li>Download your manifests</li>
                <li>
                  Control collaborator access and set permission levels when
                  inviting users
                </li>
                <li>
                  Approve or revoke browsers and AI workers for decryption
                  access
                </li>
                <li>Enable or disable push notifications at any time</li>
                <li>
                  Delete your account (this removes your metadata and all
                  associated encrypted content)
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                9. Data Security
              </h2>
              <p className="mt-2">
                We protect metadata and encrypted content using
                industry-standard security practices on our infrastructure
                (Digital Ocean). Because your sensitive content is encrypted and
                only decrypted in environments you control, the platform cannot
                access your plaintext data by design.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                10. Data Retention and Deletion
              </h2>
              <p className="mt-2">
                We retain metadata and encrypted content only while your account
                is active or as needed to provide the Service. Push subscription
                data is deleted when you disable push notifications or delete
                your account. When you delete a resource or your account, the
                associated encrypted data and metadata are removed promptly.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                11. International Data Transfers
              </h2>
              <p className="mt-2">
                Data is processed on infrastructure located in the United
                States. Because we only store encrypted content and minimal
                metadata, cross-border transfer risks are limited.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                12. Children&rsquo;s Privacy
              </h2>
              <p className="mt-2">
                Our Service is not directed to children under 16. We do not
                knowingly collect personal information from children.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                13. Changes to This Policy
              </h2>
              <p className="mt-2">
                We may update this Privacy Policy when necessary. Material
                changes will be communicated by email or prominent notice on
                nenjo.ai.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                14. Contact Us
              </h2>
              <p className="mt-2">
                For privacy questions or data requests:{" "}
                <a
                  href="mailto:privacy@nenjo.ai"
                  className="font-medium text-gray-900 underline transition-colors hover:text-[#b8841a] dark:text-white"
                >
                  privacy@nenjo.ai
                </a>
              </p>
              <p className="mt-2">
                You can also reach us through in-platform support.
              </p>
            </section>
          </div>
        </article>
      </div>
    </main>
  );
}
