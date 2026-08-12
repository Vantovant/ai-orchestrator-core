import { useState } from "react";
import { Button } from "@/components/ui/button";
import Seo from "@/components/marketing/Seo";
import signatureAsset from "@/assets/vantoos-signature.png.asset.json";
import { Check, Copy, Download } from "lucide-react";

const ABSOLUTE_URL = `https://vantoos.com${signatureAsset.url}`;

const SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0"><tr><td>
<a href="https://vantoos.com" target="_blank"><img src="${ABSOLUTE_URL}" alt="VantoOS — Plan. Fund. Deliver." width="600" style="display:block;border:0;max-width:100%;height:auto;" /></a>
</td></tr></table>`;

export default function EmailSignaturePage() {
  const [copied, setCopied] = useState<"html" | "url" | null>(null);

  const copy = async (kind: "html" | "url") => {
    await navigator.clipboard.writeText(kind === "html" ? SIGNATURE_HTML : ABSOLUTE_URL);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      <Seo
        title="VantoOS Email Signature — Official Brand Signature"
        description="Download or copy the official VantoOS email signature for Gmail, Outlook and Apple Mail."
        path="/emailsignature"
      />
      <div className="mx-auto max-w-4xl px-4 py-16 space-y-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Official Email Signature</h1>
          <p className="text-muted-foreground">
            Use this signature block in Gmail, Outlook or Apple Mail. The image is hosted on the VantoOS CDN, so it renders in every client.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
          <img
            src={signatureAsset.url}
            alt="VantoOS email signature — Plan. Fund. Deliver."
            className="w-full h-auto rounded-lg"
            loading="lazy"
          />
        </section>

        <section className="flex flex-wrap gap-3">
          <Button onClick={() => copy("html")} className="gap-2">
            {copied === "html" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "html" ? "Copied" : "Copy signature HTML"}
          </Button>
          <Button variant="outline" onClick={() => copy("url")} className="gap-2">
            {copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "url" ? "Copied" : "Copy image URL"}
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <a href={signatureAsset.url} download="VantoOS_signature.png">
              <Download className="h-4 w-4" /> Download image
            </a>
          </Button>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">How to install</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li><strong className="text-foreground">Gmail:</strong> Settings → See all settings → Signature → paste the copied block.</li>
            <li><strong className="text-foreground">Outlook:</strong> File → Options → Mail → Signatures → paste, then save.</li>
            <li><strong className="text-foreground">Apple Mail:</strong> Mail → Settings → Signatures → paste and uncheck "Always match my default message font".</li>
          </ol>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
{SIGNATURE_HTML}
          </pre>
        </section>
      </div>
    </>
  );
}
