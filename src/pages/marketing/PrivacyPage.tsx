import Seo from "@/components/marketing/Seo";

export default function PrivacyPage() {
  return (
    <>
      <Seo
        title="Privacy — VantoOS"
        description="VantoOS privacy policy. Data sovereignty, BYOK, POPIA alignment, and how we handle your information."
        path="/privacy"
      />
      <section className="py-16 bg-background">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 prose prose-slate dark:prose-invert">
          <h1>Privacy</h1>
          <p className="text-sm text-muted-foreground">
            This page is maintained by VantoOS to describe how the platform handles user information. It is app-owned editable content, not independent legal certification.
          </p>

          <h2>Data sovereignty</h2>
          <p>
            VantoOS operates on a strict BYOK (Bring Your Own Key) model. Customers supply their own AI provider credentials. VantoOS does not store, share, or transmit those keys beyond the customer's authenticated session.
          </p>

          <h2>What we collect</h2>
          <ul>
            <li>Account credentials managed via secure authentication (email + password, optional Google OAuth).</li>
            <li>Application content you create or import (tasks, notes, meetings, projects).</li>
            <li>Email metadata when you connect Gmail (subject, sender, snippet — not full message bodies unless you act on a message).</li>
            <li>Voice transcripts you generate via the dictation engine and Voice Diary.</li>
          </ul>

          <h2>How we use it</h2>
          <ul>
            <li>To render your dashboard, AI partner suggestions, and reports.</li>
            <li>To produce Write Receipts auditing every AI-initiated change.</li>
            <li>To enforce two-key governance on sensitive operations.</li>
          </ul>

          <h2>Retention & deletion</h2>
          <p>Soft-delete is used across the platform via a <code>deleted_at</code> column. Hard deletion is available on request to <a href="mailto:hello@vantoos.com">hello@vantoos.com</a>.</p>

          <h2>POPIA alignment</h2>
          <p>VantoOS is designed with South African POPIA principles in mind. We do not claim independent certification — we describe enabled platform controls factually.</p>

          <h2>Contact</h2>
          <p>For privacy requests: <a href="mailto:hello@vantoos.com">hello@vantoos.com</a>.</p>
        </div>
      </section>
    </>
  );
}
