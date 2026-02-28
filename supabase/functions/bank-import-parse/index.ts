import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple SHA-256 fingerprint
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// SA Merchant categorization rules (server-side mirror)
const SA_RULES: { pattern: RegExp; category: string }[] = [
  { pattern: /checkers|shoprite|woolworths|pick.?n.?pay|spar|food.?lover/i, category: "groceries" },
  { pattern: /engen|shell|caltex|sasol|bp|total.?energ/i, category: "fuel" },
  { pattern: /vodacom|mtn|cell.?c|telkom|rain|afrihost/i, category: "telco" },
  { pattern: /bank.?fee|monthly.?fee|service.?fee|admin.?fee|card.?fee|transaction.?fee/i, category: "bank_fees" },
  { pattern: /uber|bolt|taxi|e-?toll|sanral|gautrain/i, category: "transport" },
  { pattern: /old.?mutual|sanlam|discovery|outsurance|momentum|hollard|miway/i, category: "insurance" },
  { pattern: /medic|pharm|dis-?chem|clicks|doctor|hospital/i, category: "medical" },
  { pattern: /municipal|rates|water|electric|eskom|city.?of|prepaid.?elec/i, category: "municipal" },
  { pattern: /sars|tax.?payment|provisional|paye/i, category: "tax" },
  { pattern: /netflix|spotify|showmax|dstv|multichoice|youtube/i, category: "subscriptions" },
  { pattern: /rent|lease|bond|mortgage|home.?loan/i, category: "rent" },
  { pattern: /school|university|college|tuition/i, category: "education" },
  { pattern: /kfc|mcdonald|nando|steers|burger|pizza|debonairs|wimpy/i, category: "dining" },
  { pattern: /atm|cash.?withdrawal/i, category: "cash_withdrawal" },
  { pattern: /salary|wages|payroll|remuneration/i, category: "salary" },
];

function categorize(desc: string, userRules: { pattern: string; category: string }[]): string | null {
  const d = desc.toLowerCase();
  for (const r of userRules) {
    if (d.includes(r.pattern.toLowerCase())) return r.category;
  }
  for (const r of SA_RULES) {
    if (r.pattern.test(desc)) return r.category;
  }
  return null;
}

function extractMerchant(desc: string): string {
  return desc.replace(/\d{4}[-/]\d{2}[-/]\d{2}/g, "").replace(/\d{10,}/g, "").replace(/[*#]+/g, "").trim().split(/\s+/).slice(0, 3).join(" ") || desc.slice(0, 30);
}

function parseDate(dateStr: string): string | null {
  const cleaned = dateStr.trim();
  // Try various formats
  const formats = [
    /^(\d{4})[/-](\d{2})[/-](\d{2})$/, // YYYY/MM/DD or YYYY-MM-DD
    /^(\d{2})[/-](\d{2})[/-](\d{4})$/, // DD/MM/YYYY or MM/DD/YYYY
  ];
  for (const fmt of formats) {
    const m = cleaned.match(fmt);
    if (m) {
      if (m[1].length === 4) return `${m[1]}-${m[2]}-${m[3]}`;
      // Assume DD/MM/YYYY for SA
      return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  // Fallback: try native Date parse
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseCSV(content: string): string[][] {
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  return lines.map(line => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === ',' && !inQuotes) { result.push(current.trim()); current = ""; continue; }
      current += char;
    }
    result.push(current.trim());
    return result;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey;

    // Auth client for user verification
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Service client for storage + writes
    const adminClient = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { import_id, mapping, skip_rows = 1 } = body;

    if (!import_id) {
      return new Response(JSON.stringify({ error: "import_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch import record (verify ownership via user client)
    const { data: importRec, error: importErr } = await userClient
      .from("bank_statement_imports")
      .select("*")
      .eq("id", import_id)
      .single();
    if (importErr || !importRec) {
      return new Response(JSON.stringify({ error: "Import not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Update status to parsing
    await adminClient.from("bank_statement_imports").update({ status: "parsing" }).eq("id", import_id);

    // Download file from storage
    const { data: fileData, error: fileErr } = await adminClient.storage.from("statements").download(importRec.file_path);
    if (fileErr || !fileData) {
      await adminClient.from("bank_statement_imports").update({ status: "failed", error_message: "Failed to download file" }).eq("id", import_id);
      return new Response(JSON.stringify({ error: "File download failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const content = await fileData.text();
    const fileType = importRec.file_type;

    let transactions: { txn_date: string; description: string; reference: string | null; amount: number; balance: number | null }[] = [];

    if (fileType === "csv") {
      const rows = parseCSV(content);
      const dataRows = rows.slice(skip_rows);
      const m = mapping as { date: number; description: number; debit?: number; credit?: number; amount?: number; balance?: number; reference?: number };

      if (!m || m.date === undefined || m.description === undefined) {
        await adminClient.from("bank_statement_imports").update({ status: "needs_mapping" }).eq("id", import_id);
        // Return headers for mapping UI
        const headers = rows.length > 0 ? rows[0] : [];
        return new Response(JSON.stringify({ status: "needs_mapping", headers, sample_rows: rows.slice(1, 6) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      for (const row of dataRows) {
        if (row.length < 2) continue;
        const dateStr = row[m.date];
        const date = parseDate(dateStr || "");
        if (!date) continue;

        const desc = row[m.description] || "";
        const ref = m.reference !== undefined ? row[m.reference] || null : null;

        let amount = 0;
        if (m.amount !== undefined && row[m.amount]) {
          amount = parseFloat(row[m.amount].replace(/[^0-9.-]/g, "")) || 0;
        } else {
          const debit = m.debit !== undefined ? parseFloat((row[m.debit] || "0").replace(/[^0-9.-]/g, "")) || 0 : 0;
          const credit = m.credit !== undefined ? parseFloat((row[m.credit] || "0").replace(/[^0-9.-]/g, "")) || 0 : 0;
          amount = credit - debit;
        }

        const balance = m.balance !== undefined && row[m.balance] ? parseFloat(row[m.balance].replace(/[^0-9.-]/g, "")) || null : null;

        transactions.push({ txn_date: date, description: desc, reference: ref, amount, balance });
      }
    } else if (fileType === "ofx" || fileType === "qif") {
      // Minimal OFX parser
      if (fileType === "ofx") {
        const stmtTrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
        let match;
        while ((match = stmtTrnRegex.exec(content)) !== null) {
          const block = match[1];
          const getTag = (tag: string) => {
            const m = block.match(new RegExp(`<${tag}>([^<\\n]+)`, "i"));
            return m ? m[1].trim() : "";
          };
          const dtposted = getTag("DTPOSTED");
          const date = dtposted ? `${dtposted.slice(0,4)}-${dtposted.slice(4,6)}-${dtposted.slice(6,8)}` : null;
          const amount = parseFloat(getTag("TRNAMT")) || 0;
          const desc = getTag("NAME") || getTag("MEMO") || "";
          if (date) transactions.push({ txn_date: date, description: desc, reference: getTag("FITID") || null, amount, balance: null });
        }
      } else {
        // QIF
        let currentTxn: any = {};
        for (const line of content.split(/\r?\n/)) {
          if (line.startsWith("D")) {
            const d = parseDate(line.slice(1));
            if (d) currentTxn.txn_date = d;
          } else if (line.startsWith("T")) {
            currentTxn.amount = parseFloat(line.slice(1).replace(/[^0-9.-]/g, "")) || 0;
          } else if (line.startsWith("P") || line.startsWith("M")) {
            currentTxn.description = line.slice(1);
          } else if (line.startsWith("N")) {
            currentTxn.reference = line.slice(1);
          } else if (line === "^") {
            if (currentTxn.txn_date && currentTxn.description) {
              transactions.push({ txn_date: currentTxn.txn_date, description: currentTxn.description, reference: currentTxn.reference || null, amount: currentTxn.amount || 0, balance: null });
            }
            currentTxn = {};
          }
        }
      }
    } else if (fileType === "pdf") {
      // PDF: Send as base64 to Gemini multimodal endpoint
      const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!lovableApiKey) {
        await adminClient.from("bank_statement_imports").update({ status: "failed", error_message: "AI service not configured for PDF parsing" }).eq("id", import_id);
        return new Response(JSON.stringify({ error: "AI service not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Re-download as arrayBuffer for base64 encoding
      const { data: pdfData, error: pdfErr } = await adminClient.storage.from("statements").download(importRec.file_path);
      if (pdfErr || !pdfData) {
        await adminClient.from("bank_statement_imports").update({ status: "failed", error_message: "Failed to download PDF" }).eq("id", import_id);
        return new Response(JSON.stringify({ error: "PDF download failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
      const base64Pdf = btoa(String.fromCharCode(...pdfBytes));

      const aiPrompt = `Extract bank transactions from this South African bank statement PDF. Return ONLY a JSON array of objects with these fields:
- date: transaction date in YYYY-MM-DD format
- description: transaction description
- amount: numeric amount (positive for credits/deposits, negative for debits/payments)
- balance: running balance if available, otherwise null
- reference: reference number if available, otherwise null

Rules:
- Dates must be valid ISO dates
- Amounts must be numbers (no currency symbols)
- Credits/deposits are positive, debits/payments are negative
- If you cannot parse any transactions, return an empty array []`;

      try {
        const aiResponse = await fetch("https://api.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: aiPrompt },
                { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64Pdf}` } },
              ],
            }],
            temperature: 0.1,
          }),
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error("AI service error:", aiResponse.status, errText);
          throw new Error(`AI service returned ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        const aiText = aiData.choices?.[0]?.message?.content || "[]";

        // Extract JSON from AI response (may be wrapped in markdown code blocks)
        const jsonMatch = aiText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          await adminClient.from("bank_statement_imports").update({ status: "failed", error_message: "Could not extract transactions from PDF. Try CSV format instead." }).eq("id", import_id);
          return new Response(JSON.stringify({ error: "PDF parsing failed - no transactions found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const parsedTxns = JSON.parse(jsonMatch[0]);
        for (const pt of parsedTxns) {
          const date = parseDate(pt.date || "");
          if (!date) continue;
          const amount = typeof pt.amount === "number" ? pt.amount : parseFloat(String(pt.amount || "0").replace(/[^0-9.-]/g, "")) || 0;
          const balance = pt.balance != null ? (typeof pt.balance === "number" ? pt.balance : parseFloat(String(pt.balance).replace(/[^0-9.-]/g, ""))) || null : null;
          transactions.push({
            txn_date: date,
            description: String(pt.description || ""),
            reference: pt.reference || null,
            amount,
            balance,
          });
        }
      } catch (aiErr: any) {
        console.error("PDF AI parsing error:", aiErr);
        await adminClient.from("bank_statement_imports").update({ status: "failed", error_message: `PDF parsing failed: ${aiErr.message}. Try CSV format instead.` }).eq("id", import_id);
        return new Response(JSON.stringify({ error: "PDF parsing failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      await adminClient.from("bank_statement_imports").update({ status: "failed", error_message: "Unsupported file type. Use CSV, OFX, QIF, or PDF." }).eq("id", import_id);
      return new Response(JSON.stringify({ error: "Unsupported file type" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch user's merchant rules
    const { data: userRules } = await userClient.from("merchant_rules").select("pattern, category").is("deleted_at", null);

    // Dedup + insert
    let inserted = 0;
    let skipped = 0;
    let totalCredit = 0;
    let totalDebit = 0;
    let minDate = "";
    let maxDate = "";

    for (const txn of transactions) {
      const normalizedDesc = txn.description.toLowerCase().replace(/\s+/g, " ").trim();
      const fingerprint = await sha256(`${user.id}|${importRec.bank_account_id}|${txn.txn_date}|${txn.amount}|${normalizedDesc}`);

      const category = categorize(txn.description, (userRules ?? []) as any[]);
      const merchant = extractMerchant(txn.description);

      if (txn.amount >= 0) totalCredit += txn.amount;
      else totalDebit += Math.abs(txn.amount);

      if (!minDate || txn.txn_date < minDate) minDate = txn.txn_date;
      if (!maxDate || txn.txn_date > maxDate) maxDate = txn.txn_date;

      const { error: insertErr } = await adminClient
        .from("bank_transactions")
        .upsert({
          user_id: user.id,
          bank_account_id: importRec.bank_account_id,
          import_id: import_id,
          txn_date: txn.txn_date,
          description: txn.description,
          reference: txn.reference,
          amount: txn.amount,
          balance: txn.balance,
          fingerprint_hash: fingerprint,
          category,
          merchant,
        }, { onConflict: "user_id,fingerprint_hash", ignoreDuplicates: true });

      if (insertErr) {
        if (insertErr.code === "23505") { skipped++; continue; }
        console.error("Insert error:", insertErr);
      } else {
        inserted++;
      }
    }

    const stats = {
      row_count: transactions.length,
      inserted,
      duplicates_skipped: skipped,
      credit_total: totalCredit,
      debit_total: totalDebit,
      date_range: { from: minDate, to: maxDate },
    };

    await adminClient.from("bank_statement_imports").update({
      status: "review",
      stats_json: stats,
      error_message: null,
    }).eq("id", import_id);

    return new Response(JSON.stringify({ status: "review", stats }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("bank-import-parse error:", e);
    return new Response(JSON.stringify({ error: e.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
