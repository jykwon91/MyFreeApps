import { Link } from "react-router-dom";

export const TERMS_LAST_UPDATED = "2026-04-25";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            ← Back to MyBookkeeper
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: {TERMS_LAST_UPDATED}
        </p>

        <div className="prose prose-sm max-w-none space-y-10 text-sm leading-relaxed">

          <section>
            <p>
              MyBookkeeper is a personal project, not a regulated financial-services product. These
              terms are written in plain English. They are not a substitute for legal advice — if
              you plan to use this commercially, consult a lawyer.
            </p>
          </section>

          <section id="acceptance">
            <h2 className="text-xl font-semibold mb-3">Acceptance</h2>
            <p>
              By creating an account or using MyBookkeeper, you agree to these terms. If you don't
              agree, don't use the service.
            </p>
          </section>

          <section id="the-service">
            <h2 className="text-xl font-semibold mb-3">The service</h2>
            <p>
              MyBookkeeper is a personal bookkeeping tool. It helps you track income and expenses,
              extract data from receipts and invoices using AI, and organize financial records for
              rental properties. It is provided as-is, with no warranty of any kind.
            </p>
            <p className="mt-2">
              The service is operated by a solo developer as a side project. Uptime is best-effort
              — this runs on a single server, and there will be occasional downtime.
            </p>
          </section>

          <section id="your-account">
            <h2 className="text-xl font-semibold mb-3">Your account</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>One account per person — accounts are for individual use only</li>
              <li>
                You are responsible for keeping your password and 2FA codes secure. Don't share
                your credentials.
              </li>
              <li>
                You must provide a valid email address. A verification link will be sent before
                you can log in.
              </li>
              <li>
                You must be at least 13 years old to create an account.
              </li>
            </ul>
          </section>

          <section id="acceptable-use">
            <h2 className="text-xl font-semibold mb-3">Acceptable use</h2>
            <p className="mb-3">You agree to use MyBookkeeper only for its intended purpose. Specifically, you will not:</p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                Use it for commercial data scraping or automated extraction beyond your own
                financial records
              </li>
              <li>Upload content you don't have the right to process (e.g., someone else's documents without authorization)</li>
              <li>Attempt to compromise the service, gain unauthorized access, or reverse-engineer any part of it</li>
              <li>Resell, white-label, or redistribute the service</li>
              <li>Use it for any unlawful purpose</li>
            </ul>
          </section>

          <section id="intellectual-property">
            <h2 className="text-xl font-semibold mb-3">Intellectual property</h2>
            <p>
              <strong>Your data is yours.</strong> You own all the financial records, documents, and
              data you store in MyBookkeeper. You can export or delete it at any time.
            </p>
            <p className="mt-2">
              <strong>The software is ours.</strong> The MyBookkeeper application code, design, and
              branding belong to the developer. You're granted a personal, non-transferable license
              to use the service.
            </p>
          </section>

          <section id="termination">
            <h2 className="text-xl font-semibold mb-3">Termination</h2>
            <p>
              <strong>You</strong> can delete your account at any time from{" "}
              <strong>Settings → Security → Delete my account</strong>. Deletion is immediate and
              permanent.
            </p>
            <p className="mt-2">
              <strong>We</strong> may suspend or terminate an account that violates these terms,
              abuses the service, or poses a security risk. We'll try to give notice first except
              when immediate action is required.
            </p>
            <p className="mt-2">
              Since the service is currently free, termination creates no refund obligations.
            </p>
          </section>

          <section id="disclaimers">
            <h2 className="text-xl font-semibold mb-3">Disclaimers</h2>
            <p className="mb-3">
              The service is provided "as is" without any warranty, express or implied. In
              particular:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Availability</strong> — service runs on a single server. Occasional
                downtime happens. No uptime guarantee.
              </li>
              <li>
                <strong>AI extraction accuracy</strong> — the AI extraction can be wrong.
                Always verify extracted data before relying on it for tax filings or financial
                decisions. MyBookkeeper is a bookkeeping assistant, not a certified accountant.
              </li>
              <li>
                <strong>Data safety</strong> — automated backups exist and are retained for 30
                days, but backups are not guaranteed. Export your data periodically if it matters
                to you.
              </li>
              <li>
                <strong>Tax or legal advice</strong> — nothing in this app constitutes tax, legal,
                or financial advice. Consult a qualified professional for those needs.
              </li>
            </ul>
          </section>

          <section id="limitation-of-liability">
            <h2 className="text-xl font-semibold mb-3">Limitation of liability</h2>
            <p>
              To the maximum extent permitted by applicable law, we are not liable for any indirect,
              incidental, consequential, or punitive damages, including lost profits or lost data,
              arising from your use of MyBookkeeper.
            </p>
            <p className="mt-2">
              Our total direct liability to you for any claim is capped at the amount you've paid
              us in the 12 months preceding the claim. Since the service is currently free, that
              cap is $0.
            </p>
          </section>

          <section id="indemnification">
            <h2 className="text-xl font-semibold mb-3">Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless the developer from any claims, losses, or
              expenses (including reasonable legal fees) arising from your misuse of the service,
              your violation of these terms, or your violation of any third-party rights.
            </p>
          </section>

          <section id="governing-law">
            <h2 className="text-xl font-semibold mb-3">Governing law</h2>
            <p>
              These terms are governed by the laws of the state in which the service operator
              resides, without regard to conflict-of-law principles.
            </p>
          </section>

          <section id="changes">
            <h2 className="text-xl font-semibold mb-3">Changes to these terms</h2>
            <p>
              When these terms change, the "Last updated" date at the top will be bumped. For
              material changes, we'll aim to notify registered users by email. Continued use of
              MyBookkeeper after the updated date constitutes acceptance of the revised terms.
            </p>
          </section>

          <section id="contact">
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p>
              Questions or concerns:{" "}
              <a href="mailto:jasonykwon91@gmail.com" className="text-primary hover:underline">
                jasonykwon91@gmail.com
              </a>
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
