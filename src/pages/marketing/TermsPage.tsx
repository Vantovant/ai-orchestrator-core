import Seo from "@/components/marketing/Seo";

export default function TermsPage() {
  return (
    <>
      <Seo
        title="Terms — VantoOS"
        description="VantoOS terms of service."
        path="/terms"
      />
      <section className="py-16 bg-background">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 prose prose-slate dark:prose-invert">
          <h1>Terms of Service</h1>
          <p className="text-sm text-muted-foreground">
            These terms govern your use of VantoOS. By using the platform, you agree to them.
          </p>

          <h2>BYOK</h2>
          <p>You must supply your own AI provider credentials. VantoOS is not responsible for usage fees billed by your AI provider.</p>

          <h2>Acceptable use</h2>
          <p>No unlawful, abusive, or rights-infringing content. No attempts to bypass two-key governance or the approval gate on multi-user installations.</p>

          <h2>Liability</h2>
          <p>VantoOS provides the platform "as is" for pilot and production use. Specific service-level commitments are governed by your enterprise agreement, if applicable.</p>

          <h2>Changes</h2>
          <p>We may update these terms. Material changes will be communicated by email to account owners.</p>

          <h2>Contact</h2>
          <p><a href="mailto:hello@vantoos.com">hello@vantoos.com</a></p>
        </div>
      </section>
    </>
  );
}
