import { Link } from "react-router-dom";

export const PRIVACY_LAST_UPDATED = "2026-04-25";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            ← Back to MyBookkeeper
          </Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: {PRIVACY_LAST_UPDATED}
        </p>

        <div className="prose prose-sm max-w-none space-y-10 text-sm leading-relaxed">

          <section id="who-we-are">
            <h2 className="text-xl font-semibold mb-3">Who we are</h2>
            <p>
              MyBookkeeper is a personal bookkeeping app built for rental property owners. It helps
              you track income and expenses, extract data from receipts and invoices, and connect your
              Gmail inbox to automatically pull in billing emails.
            </p>
            <p className="mt-2">
              This is a solo-developer project — not a corporation. If you have any questions about
              your data, email{" "}
              <a href="mailto:jasonykwon91@gmail.com" className="text-primary hover:underline">
                jasonykwon91@gmail.com
              </a>{" "}
              and you'll hear from the person who wrote the code.
            </p>
            <p className="mt-2 text-muted-foreground italic text-xs">
              Note: This policy is written in plain English for a personal project. It is not legal
              advice. If you plan to use MyBookkeeper in a regulated commercial context, consult a
              lawyer.
            </p>
          </section>

          <section id="what-we-collect">
            <h2 className="text-xl font-semibold mb-3">What we collect</h2>

            <h3 className="font-semibold mt-4 mb-2">Account information</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Your email address</li>
              <li>Your password (stored as an argon2id hash — we never see the plaintext)</li>
              <li>
                Your name, if you choose to provide it
              </li>
              <li>
                A TOTP secret if you enable two-factor authentication (encrypted at rest)
              </li>
            </ul>

            <h3 className="font-semibold mt-4 mb-2">Bookkeeping data</h3>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Receipts, invoices, and other documents you upload</li>
              <li>
                Transaction records extracted from those documents, including amounts, dates, vendors,
                and categories
              </li>
              <li>
                Properties and addresses you add to your account
              </li>
              <li>
                Tax documents and return data you create or that get generated from your transactions
              </li>
            </ul>

            <h3 className="font-semibold mt-4 mb-2">Gmail integration (optional)</h3>
            <p>
              If you connect your Gmail account, we collect:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>
                OAuth refresh and access tokens (encrypted at rest using Fernet symmetric encryption)
              </li>
              <li>
                Metadata and body text of emails that match billing-related subjects (invoices,
                receipts, payments, etc.)
              </li>
              <li>
                File attachments from those emails, processed for data extraction
              </li>
            </ul>
            <p className="mt-2">
              Gmail data is used only to extract your bookkeeping records. We do not read, store, or
              analyze email content for any other purpose.
            </p>

            <h3 className="font-semibold mt-4 mb-2">Server logs</h3>
            <p>
              Standard web server logs: IP address, browser/device info, timestamps, and which pages
              you visit. These are not linked to your identity unless you're logged in, and they're
              used only for security monitoring and debugging.
            </p>
          </section>

          <section id="why-we-collect">
            <h2 className="text-xl font-semibold mb-3">Why we collect it</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Account data</strong> — to authenticate you and keep your account secure
              </li>
              <li>
                <strong>Bookkeeping data</strong> — this is the product; without it, there's nothing
                to show you
              </li>
              <li>
                <strong>Gmail data</strong> — to automatically find and extract receipts from your
                inbox, saving you manual data entry
              </li>
              <li>
                <strong>Server logs</strong> — to detect abuse, debug problems, and understand
                whether the service is healthy
              </li>
            </ul>
          </section>

          <section id="where-stored">
            <h2 className="text-xl font-semibold mb-3">Where your data is stored</h2>
            <p>
              All data lives in a PostgreSQL database and on the filesystem of a single virtual
              private server hosted in a United States data center. Uploaded files are stored on that
              same server's disk. There is no CDN, no distributed cloud storage, and no third-party
              data warehouse involved.
            </p>
          </section>

          <section id="how-long">
            <h2 className="text-xl font-semibold mb-3">How long we keep it</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>
                <strong>Active accounts</strong> — your data is retained as long as your account
                exists
              </li>
              <li>
                <strong>Deleted accounts</strong> — all your data is permanently deleted immediately
                when you delete your account (Settings → Danger Zone → Delete account). This includes
                your properties, documents, transactions, integrations, and usage logs. There is no
                soft-delete or grace period.
              </li>
              <li>
                <strong>Database backups</strong> — automated backups are retained for 30 days. Your
                data will be purged from backups within 30 days of account deletion.
              </li>
              <li>
                <strong>Server logs</strong> — retained indefinitely for security and debugging.
                After account deletion, log entries are not retroactively anonymized (we don't
                currently have the tooling to do that reliably — we'd rather be honest than
                over-promise).
              </li>
            </ul>
          </section>

          <section id="who-we-share-with">
            <h2 className="text-xl font-semibold mb-3">Who we share your data with</h2>
            <p className="mb-3">
              We share data only with the third-party services required to operate MyBookkeeper. We do
              not sell your data. We do not share it with advertisers or data brokers.
            </p>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-1">Anthropic (Claude AI)</h3>
                <p>
                  When you upload a document or sync a Gmail email, its content is sent to
                  Anthropic's Claude API for data extraction. Anthropic's{" "}
                  <a
                    href="https://www.anthropic.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    privacy policy
                  </a>{" "}
                  applies to that data. We use the standard API tier — we have not opted in to any
                  data-training program.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Google (Gmail API)</h3>
                <p>
                  If you connect Gmail, requests are made via the Google API. We hold your OAuth
                  tokens; Google processes the API calls. Google's{" "}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    privacy policy
                  </a>{" "}
                  applies to those interactions.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Cloudflare (Turnstile CAPTCHA)</h3>
                <p>
                  Cloudflare Turnstile is used on the registration and forgot-password pages to
                  prevent bots. Cloudflare sees your IP address and browser fingerprint during those
                  interactions. Cloudflare's{" "}
                  <a
                    href="https://www.cloudflare.com/privacypolicy/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    privacy policy
                  </a>{" "}
                  applies.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">SMTP provider (transactional email)</h3>
                <p>
                  Outbound emails (email verification, password reset) are sent via SMTP. Your email
                  address is passed to the mail server to deliver those messages. Currently this is
                  Gmail SMTP — Google's privacy policy applies.
                </p>
              </div>
            </div>
          </section>

          <section id="your-rights">
            <h2 className="text-xl font-semibold mb-3">Your rights</h2>
            <p className="mb-3">
              You have control over your data. Here's how to exercise each right:
            </p>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-1">Access and portability</h3>
                <p>
                  You can download a full JSON export of your data at any time from{" "}
                  <strong>Settings → Security → Download my data</strong>. The export includes your
                  properties, document metadata, transactions, and integration connection status. It
                  never includes your password hash, TOTP secret, or OAuth tokens.
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Endpoint: <code>GET /api/users/me/export</code>
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Deletion (right to erasure)</h3>
                <p>
                  You can permanently delete your account from{" "}
                  <strong>Settings → Security → Delete my account</strong>. Deletion requires
                  password re-verification plus email confirmation (and a TOTP code if you have 2FA
                  enabled). Deletion is immediate and irreversible.
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Endpoint: <code>DELETE /api/users/me</code>
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Correction</h3>
                <p>
                  Every transaction, property, and document can be edited in the app. If something
                  was extracted incorrectly, you can fix it directly.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-1">Objection or restriction</h3>
                <p>
                  If you want to limit how your data is used beyond what the app settings offer,
                  email{" "}
                  <a href="mailto:jasonykwon91@gmail.com" className="text-primary hover:underline">
                    jasonykwon91@gmail.com
                  </a>
                  .
                </p>
              </div>
            </div>
          </section>

          <section id="security">
            <h2 className="text-xl font-semibold mb-3">Security measures</h2>
            <ul className="list-disc list-inside space-y-2 ml-2">
              <li>All data is transmitted over TLS (HTTPS)</li>
              <li>Passwords are hashed with argon2id</li>
              <li>
                Gmail OAuth tokens are encrypted at rest with Fernet symmetric encryption derived
                from a server-side key
              </li>
              <li>
                Passwords are checked against the HaveIBeenPwned database at registration and reset
                (via k-anonymity — your password never leaves our server in plaintext)
              </li>
              <li>Two-factor authentication (TOTP) is available in Settings → Security</li>
              <li>Accounts lock after 5 consecutive failed login attempts</li>
              <li>Cloudflare Turnstile protects registration and forgot-password from bots</li>
            </ul>
            <p className="mt-3">
              That said, no system is perfectly secure. If you find a vulnerability, please email{" "}
              <a href="mailto:jasonykwon91@gmail.com" className="text-primary hover:underline">
                jasonykwon91@gmail.com
              </a>{" "}
              before disclosing publicly.
            </p>
          </section>

          <section id="cookies">
            <h2 className="text-xl font-semibold mb-3">Cookies and tracking</h2>
            <p>
              MyBookkeeper does not use cookies. Your authentication token is stored in your
              browser's <code>localStorage</code>, not in a cookie. We do not use analytics
              trackers, advertising pixels, or any third-party tracking scripts.
            </p>
          </section>

          <section id="children">
            <h2 className="text-xl font-semibold mb-3">Children's data</h2>
            <p>
              MyBookkeeper is a financial tool intended for adults. We do not knowingly collect data
              from anyone under 13. If you believe a child's data has been submitted in error, email
              us and we'll delete it.
            </p>
          </section>

          <section id="changes">
            <h2 className="text-xl font-semibold mb-3">Changes to this policy</h2>
            <p>
              When this policy changes, the "Last updated" date at the top will be bumped. For
              material changes, we'll aim to notify registered users by email. Continued use of
              MyBookkeeper after the updated date constitutes acceptance of the revised policy.
            </p>
          </section>

          <section id="contact">
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p>
              Questions, requests, or concerns:{" "}
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
