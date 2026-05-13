import type { Metadata } from "next";
import Link from "next/link";
import { NenjoLogoMark } from "@/components/layout/NenjoLogoMark";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Nenjo terms of service.",
};

export default function TermsOfServicePage() {
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
            href="/policy"
            className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            Privacy Policy
          </Link>
        </header>

        <article className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
            Legal
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Terms of Service
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
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access
              to and use of the Nenjo platform, website (nenjo.ai), APIs, SDK,
              and related services (collectively, the &ldquo;Service&rdquo;)
              provided by Boon Labs LLC (&ldquo;Boon Labs,&rdquo;
              &ldquo;Nenjo,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
              &ldquo;our&rdquo;).
            </p>
            <p>
              By creating an account, accessing the Service, or using any part
              of Nenjo, you agree to these Terms. If you do not agree, do not
              use the Service.
            </p>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                1. Description of the Service
              </h2>
              <p className="mt-2">
                Nenjo is a modular and portable agentic workflow platform that
                allows users to define, manage, and orchestrate AI agents,
                abilities, routines, councils, tasks, projects, and related
                resources as manifests. The platform provides tools for
                collaboration (councils), structured execution (routines with
                gates), memory management, platform scopes, and integration with
                external systems via MCP.
              </p>
              <p className="mt-2">
                The Service includes a hosted control plane for creating and
                managing manifests and resources, coordination with
                user-connected AI workers via NATS, APIs, SDK, documentation,
                and built-in agent tooling (including the Nenji agent).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                2. Eligibility and Accounts
              </h2>
              <p className="mt-2">
                You must be at least 18 years old (or the age of majority in
                your jurisdiction) to use the Service. You are responsible for
                maintaining the confidentiality of your account credentials and
                for all activity that occurs under your account.
              </p>
              <p className="mt-2">
                We use Clerk to handle authentication. You may sign in using
                email and password or supported third-party providers (Google,
                GitHub). You agree to provide accurate information and keep it
                updated.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                3. Your Content and Responsibilities
              </h2>
              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                3.1 Ownership
              </h3>
              <p className="mt-2">
                You retain all ownership rights in the manifests, prompts,
                documents, context blocks, routines, tasks, and other content
                you create or upload (&ldquo;Your Content&rdquo;).
              </p>

              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                3.2 Your Responsibilities
              </h3>
              <p className="mt-2">You are solely responsible for:</p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>
                  The accuracy, legality, and appropriateness of Your Content
                </li>
                <li>
                  Ensuring that any data, prompts, or tasks you provide to
                  agents comply with applicable laws and do not violate the
                  rights of others
                </li>
                <li>
                  The behavior and outputs of agents and routines you create and
                  run
                </li>
                <li>
                  Compliance with all laws when using the Service (including
                  data protection, export control, and industry-specific
                  regulations)
                </li>
                <li>
                  Properly scoping agents and controlling access via platform
                  scopes and organization invites
                </li>
              </ul>

              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                3.3 Encryption &amp; Decryption
              </h3>
              <p className="mt-2">
                Your sensitive content is stored in encrypted form. Decryption
                occurs only in browsers or AI workers you have explicitly
                approved. You are responsible for managing approvals and
                securing the environments where decryption occurs.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                4. Your AI Workers and Local Execution
              </h2>
              <p className="mt-2">
                You are responsible for deploying and operating your own AI
                workers. All plaintext processing, decryption of Your Content,
                and calls to AI models (using your own API keys) occur entirely
                within infrastructure you control.
              </p>
              <p className="mt-2">
                Nenjo only coordinates execution through metadata and encrypted
                payloads. We are not responsible for the performance, security,
                cost, or outputs of your AI workers or the AI models you choose
                to use.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                5. Prohibited Uses
              </h2>
              <p className="mt-2">You may not use the Service to:</p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Violate any applicable law or regulation</li>
                <li>
                  Infringe the intellectual property or privacy rights of others
                </li>
                <li>Transmit malware, viruses, or harmful code</li>
                <li>
                  Attempt to gain unauthorized access to the Service or other
                  users&rsquo; accounts
                </li>
                <li>
                  Reverse engineer, decompile, or attempt to extract source code
                  from the Service (except as expressly permitted)
                </li>
                <li>
                  Use the Service to build a competing product without our prior
                  written consent
                </li>
                <li>
                  Engage in any activity that could reasonably be expected to
                  harm the Service or other users
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                6. Third-Party Services and Integrations
              </h2>
              <p className="mt-2">
                The Service integrates with or relies on third-party services,
                including but not limited to:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Clerk (authentication)</li>
                <li>Digital Ocean (infrastructure)</li>
                <li>Resend (email delivery)</li>
                <li>Vercel (site functionality and analytics)</li>
                <li>Git repositories and MCP servers you choose to connect</li>
                <li>AI model providers you configure in your agents</li>
              </ul>
              <p className="mt-3">
                Your use of these third-party services is subject to their own
                terms and privacy policies. We are not responsible for the
                practices of these third parties.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                7. Subscriptions and Billing
              </h2>
              <p className="mt-2">
                Certain features of the Service may require a paid
                subscription. If you purchase a subscription, you agree to pay
                all applicable fees. We will provide clear pricing and billing
                terms before you are charged.
              </p>
              <p className="mt-2">
                You may cancel your subscription at any time. Cancellation will
                take effect at the end of your current billing period. We do not
                provide refunds for partial periods.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                8. Intellectual Property
              </h2>
              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                8.1 Nenjo IP
              </h3>
              <p className="mt-2">
                Boon Labs and its licensors retain all rights, title, and
                interest in and to the Service, including all software,
                documentation, trademarks, and intellectual property.
              </p>

              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                8.2 Your Content
              </h3>
              <p className="mt-2">
                Subject to these Terms, you grant us a limited, non-exclusive
                license to host, store, and process Your Content solely as
                necessary to provide the Service to you.
              </p>

              <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                8.3 Feedback
              </h3>
              <p className="mt-2">
                If you provide feedback or suggestions, you grant us a
                perpetual, irrevocable, royalty-free license to use that
                feedback to improve the Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                9. Termination
              </h2>
              <p className="mt-2">
                We may suspend or terminate your access to the Service at any
                time if you violate these Terms or for any other reason, with or
                without notice.
              </p>
              <p className="mt-2">
                You may terminate your account at any time by deleting it
                through the Service or contacting support. Upon termination,
                your right to use the Service ends immediately. We will delete
                or anonymize your metadata and encrypted content in accordance
                with our Privacy Policy.
              </p>
              <p className="mt-2">
                Sections that by their nature should survive termination
                (including Intellectual Property, Disclaimers, Limitation of
                Liability, and Indemnification) will survive.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                10. Disclaimers
              </h2>
              <p className="mt-2 font-semibold text-gray-900 dark:text-white">
                THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
                AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS
                OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF
                MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
                NON-INFRINGEMENT.
              </p>
              <p className="mt-3">We do not warrant that:</p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>The Service will be uninterrupted, secure, or error-free</li>
                <li>
                  Agent outputs, routine results, or any AI-generated content
                  will be accurate, reliable, or suitable for your intended use
                </li>
                <li>
                  Your Content will remain confidential in all circumstances
                  (you control decryption environments)
                </li>
              </ul>
              <p className="mt-3">
                You acknowledge that AI systems can produce incorrect, biased,
                or unexpected outputs. You are solely responsible for reviewing
                and validating all outputs before using them.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                11. Limitation of Liability
              </h2>
              <p className="mt-2 font-semibold text-gray-900 dark:text-white">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, BOON LABS SHALL NOT BE
                LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
                PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR
                BUSINESS OPPORTUNITIES, WHETHER INCURRED DIRECTLY OR INDIRECTLY,
                OR ANY DAMAGES RESULTING FROM YOUR USE OF AI AGENTS, ROUTINES,
                OR MODEL OUTPUTS.
              </p>
              <p className="mt-3 font-semibold text-gray-900 dark:text-white">
                OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR
                RELATING TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE
                AMOUNT YOU PAID TO US IN THE TWELVE (12) MONTHS PRECEDING THE
                CLAIM.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                12. Indemnification
              </h2>
              <p className="mt-2">
                You agree to indemnify, defend, and hold harmless Boon Labs and
                its officers, directors, employees, and agents from and against
                any claims, damages, losses, liabilities, and expenses
                (including reasonable attorneys&rsquo; fees) arising out of or
                related to:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Your use of the Service</li>
                <li>Your Content</li>
                <li>Your agents, routines, or AI workers</li>
                <li>Your violation of these Terms or applicable law</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                13. Governing Law and Dispute Resolution
              </h2>
              <p className="mt-2">
                These Terms shall be governed by and construed in accordance
                with the laws of the State of Iowa, without regard to its
                conflict of laws principles.
              </p>
              <p className="mt-2">
                Any dispute arising out of or relating to these Terms or the
                Service shall first be attempted to be resolved through
                good-faith negotiation. If negotiation fails, the dispute shall
                be resolved exclusively in the state or federal courts located
                in the State of Iowa. You consent to the personal jurisdiction
                of such courts.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                14. Changes to These Terms
              </h2>
              <p className="mt-2">
                We may update these Terms from time to time. Material changes
                will be communicated by email or prominent notice on nenjo.ai.
                Your continued use of the Service after the effective date of
                updated Terms constitutes acceptance of the changes.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                15. Miscellaneous
              </h2>
              <p className="mt-2">
                These Terms constitute the entire agreement between you and Boon
                Labs regarding the Service and supersede all prior agreements.
                If any provision is found unenforceable, the remaining
                provisions will remain in effect. You may not assign these Terms
                without our prior written consent. No waiver of any provision
                shall be effective unless in writing.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                16. Contact Us
              </h2>
              <p className="mt-2">
                For questions about these Terms:{" "}
                <a
                  href="mailto:legal@nenjo.ai"
                  className="font-medium text-gray-900 underline transition-colors hover:text-[#b8841a] dark:text-white"
                >
                  legal@nenjo.ai
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
