import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { pageGuides, fullManualSections } from "@/components/guide/guideContent";

export default function UserManualPage() {
  const navigate = useNavigate();

  const handleDownload = () => {
    const allPages = Object.entries(pageGuides);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>VantoOS Beta Tester — User Manual</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; line-height: 1.7; }
  h1 { text-align: center; font-size: 28px; margin-bottom: 4px; }
  .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 40px; }
  h2 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin-top: 36px; }
  h3 { color: #1e40af; margin-top: 24px; }
  .step { background: #f8fafc; border-left: 3px solid #2563eb; padding: 10px 16px; margin: 8px 0; border-radius: 4px; font-size: 14px; }
  .tip { background: #fefce8; border-left: 3px solid #eab308; padding: 8px 16px; margin: 6px 0; border-radius: 4px; font-size: 13px; }
  .tip::before { content: "💡 "; }
  .section { page-break-inside: avoid; }
  .toc { background: #f1f5f9; padding: 20px 30px; border-radius: 8px; margin-bottom: 30px; }
  .toc a { text-decoration: none; color: #2563eb; display: block; padding: 3px 0; font-size: 14px; }
  .toc a:hover { text-decoration: underline; }
  .footer { text-align: center; margin-top: 60px; color: #999; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style>
</head>
<body>

<h1>📘 VantoOS — User Manual</h1>
<p class="subtitle">Beta Tester Edition · ${new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

<div class="toc">
<strong>Table of Contents</strong>
${fullManualSections.map((s, i) => `<a href="#intro-${i}">${i + 1}. ${s.title}</a>`).join('\n')}
${allPages.map(([, g], i) => `<a href="#page-${i}">${fullManualSections.length + i + 1}. ${g.title}</a>`).join('\n')}
</div>

${fullManualSections.map((s, i) => `
<div class="section" id="intro-${i}">
<h2>${i + 1}. ${s.title}</h2>
${s.content.map(c => `<div class="step">${c}</div>`).join('\n')}
</div>
`).join('\n')}

${allPages.map(([, guide], i) => `
<div class="section" id="page-${i}">
<h2>${fullManualSections.length + i + 1}. ${guide.title}</h2>
${guide.steps.map((step, j) => `<div class="step"><strong>Step ${j + 1}:</strong> ${step}</div>`).join('\n')}
${guide.tips ? `<h3>💡 Tips</h3>${guide.tips.map(t => `<div class="tip">${t}</div>`).join('\n')}` : ''}
</div>
`).join('\n')}

<div class="section">
<h2>Need Help?</h2>
<div class="step">If you run into any issues or have questions, contact the person who sent you the invite. Your feedback is incredibly valuable during this beta phase — don't hold back!</div>
<div class="step">Look for the <strong>❓ question mark button</strong> on any page inside VantoOS for instant, contextual guidance.</div>
</div>

<div class="footer">
<p>VantoOS · AI-Powered Executive Operating System</p>
<p>This document was generated on ${new Date().toLocaleDateString('en-ZA')}. Contents may change as features evolve.</p>
</div>

</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "VantoOS_User_Manual.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const allPages = Object.entries(pageGuides);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">📘 User Manual</h1>
            <p className="text-sm text-muted-foreground">Beta Tester Guide — Step by step instructions for every feature</p>
          </div>
        </div>
        <Button onClick={handleDownload} className="gap-2">
          <Download className="h-4 w-4" /> Download Manual
        </Button>
      </div>

      {/* Getting Started */}
      {fullManualSections.map((section, idx) => (
        <Card key={idx}>
          <CardContent className="p-6 space-y-3">
            <h2 className="text-lg font-bold">{section.title}</h2>
            {section.content.map((line, i) => (
              <div key={i} className="flex gap-3 items-start text-sm">
                <div className="h-5 w-5 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</div>
                <p>{line}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Page-by-page guides */}
      {allPages.map(([path, guide], idx) => (
        <Card key={path}>
          <CardContent className="p-6 space-y-3">
            <h2 className="text-lg font-bold">{guide.title}</h2>
            {guide.steps.map((step, i) => (
              <div key={i} className="flex gap-3 items-start text-sm rounded-lg border border-border p-3 bg-muted/30">
                <div className="h-6 w-6 shrink-0 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">{i + 1}</div>
                <p className="leading-relaxed">{step}</p>
              </div>
            ))}
            {guide.tips && (
              <div className="mt-3 space-y-1.5 pl-2">
                {guide.tips.map((tip, i) => (
                  <p key={i} className="text-sm text-muted-foreground">💡 {tip}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="text-center py-4">
        <Button onClick={handleDownload} variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Download Full Manual (HTML)
        </Button>
      </div>
    </div>
  );
}
