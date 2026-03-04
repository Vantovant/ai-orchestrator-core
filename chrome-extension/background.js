// VantoOS Companion - Background Service Worker (MV3)

// Open the side panel for the tab the user clicked from
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      return;
    }
    const win = await chrome.windows.getCurrent();
    if (win?.id) {
      await chrome.sidePanel.open({ windowId: win.id });
    }
  } catch (err) {
    console.error("Failed to open side panel:", err);
  }
});

// Inject floating button on allowed domains when tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab?.url) return;
  try {
    const hostname = new URL(tab.url).hostname;
    // Check if we have permission for this domain
    const hasPermission = await new Promise(resolve =>
      chrome.permissions.contains({ origins: [`https://${hostname}/*`, `http://${hostname}/*`] }, resolve)
    );
    if (!hasPermission) return;

    // Check stored allowed domains
    const stored = await chrome.storage.local.get(["vantoos_allowed_domains"]);
    const allowed = stored.vantoos_allowed_domains || [];
    if (!allowed.includes(hostname)) return;

    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-script.js"],
    });
  } catch (_) { /* ignore non-injectable tabs like chrome:// */ }
});

// Listen for messages from side panel and content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Open side panel from content script FAB
  if (msg?.type === "OPEN_SIDE_PANEL") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ error: "Pair extension in Settings first" });
      return true;
    }
    chrome.sidePanel.open({ tabId }).then(() => {
      sendResponse({ ok: true });
    }).catch((err) => {
      sendResponse({ error: err?.message || "Failed to open side panel" });
    });
    return true;
  }

  // Quick capture: basic tab info + selection
  if (msg?.type === "CAPTURE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        const tab = tabs?.[0];
        if (!tab?.id) {
          sendResponse({ error: "No active tab" });
          return;
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            url: window.location.href,
            title: document.title,
            selectedText: window.getSelection()?.toString() || "",
            metaDescription:
              document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
          }),
        });

        sendResponse({ data: results?.[0]?.result || null });
      } catch (e) {
        sendResponse({ error: e?.message || String(e) });
      }
    });
    return true;
  }

  // Smart capture: curated page snapshot
  if (msg?.type === "SMART_CAPTURE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        const tab = tabs?.[0];
        if (!tab?.id) {
          sendResponse({ error: "No active tab" });
          return;
        }

        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const MAX_TEXT_CHARS = 8000;
            const MAX_HEADINGS = 30;
            const MAX_TABLES = 3;
            const MAX_TABLE_ROWS = 30;

            // URL, title, meta
            const url = window.location.href;
            const title = document.title;
            const selectedText = window.getSelection()?.toString() || "";
            const metaDescription =
              document.querySelector('meta[name="description"]')?.getAttribute("content") || "";

            // Headings
            const headingEls = document.querySelectorAll("h1, h2, h3");
            const headings = [];
            for (let i = 0; i < Math.min(headingEls.length, MAX_HEADINGS); i++) {
              const txt = (headingEls[i].textContent || "").trim();
              if (txt) headings.push(`${headingEls[i].tagName}: ${txt}`);
            }

            // Key visible text blocks
            const textBlocks = [];
            let textChars = 0;
            const blockEls = document.querySelectorAll("p, li, td, article, section > div, blockquote");
            for (const el of blockEls) {
              if (textChars >= MAX_TEXT_CHARS) break;
              const txt = (el.textContent || "").trim();
              if (txt.length > 20 && txt.length < 2000) {
                const remaining = MAX_TEXT_CHARS - textChars;
                const chunk = txt.slice(0, remaining);
                textBlocks.push(chunk);
                textChars += chunk.length;
              }
            }

            // Tables (first 3, max 30 rows total)
            const tables = [];
            const tableEls = document.querySelectorAll("table");
            let totalRows = 0;
            for (let t = 0; t < Math.min(tableEls.length, MAX_TABLES); t++) {
              const rows = tableEls[t].querySelectorAll("tr");
              const tableData = [];
              for (let r = 0; r < rows.length && totalRows < MAX_TABLE_ROWS; r++) {
                const cells = rows[r].querySelectorAll("th, td");
                const rowData = [];
                for (const cell of cells) {
                  rowData.push((cell.textContent || "").trim().slice(0, 200));
                }
                tableData.push(rowData);
                totalRows++;
              }
              if (tableData.length) tables.push(tableData);
            }

            // Form fields (labels + values, redact sensitive)
            const formFields = [];
            const inputs = document.querySelectorAll("input, select, textarea");
            for (const inp of inputs) {
              if (formFields.length >= 20) break;
              const label =
                inp.getAttribute("aria-label") ||
                inp.getAttribute("placeholder") ||
                (inp.labels?.[0]?.textContent || "").trim() ||
                inp.getAttribute("name") ||
                "";
              if (!label) continue;
              let value = inp.value || "";
              // Redact sensitive-looking values
              if (/email|phone|tel|ssn|id.?num/i.test(label) || /\d{10,}/.test(value)) {
                value = "[REDACTED]";
              }
              formFields.push({ label: label.slice(0, 100), value: value.slice(0, 100) });
            }

            // Simple entity detection (amounts, dates, reference numbers)
            const bodyText = document.body?.innerText || "";
            const entities = [];

            // Currency amounts (R, $, €, £)
            const amountMatches = bodyText.match(/[R$€£]\s?[\d,]+(?:\.\d{1,2})?/g);
            if (amountMatches) {
              for (const m of amountMatches.slice(0, 10)) {
                entities.push({ type: "amount", value: m.trim() });
              }
            }

            // Dates
            const dateMatches = bodyText.match(
              /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}\b/gi
            );
            if (dateMatches) {
              for (const m of dateMatches.slice(0, 10)) {
                entities.push({ type: "date", value: m.trim() });
              }
            }

            // Reference numbers (common patterns)
            const refMatches = bodyText.match(/\b(?:REF|INV|PO|ORDER|QUOTE|#)\s?[:\-]?\s?[A-Z0-9\-]{4,20}\b/gi);
            if (refMatches) {
              for (const m of refMatches.slice(0, 10)) {
                entities.push({ type: "reference", value: m.trim() });
              }
            }

            return {
              url,
              title,
              selectedText,
              metaDescription,
              headings,
              textBlocks,
              tables,
              formFields,
              entities,
            };
          },
        });

        sendResponse({ data: results?.[0]?.result || null });
      } catch (e) {
        sendResponse({ error: e?.message || String(e) });
      }
    });
    return true;
  }

  // Request domain permission (https + http)
  if (msg?.type === "REQUEST_DOMAIN_PERMISSION") {
    const domain = String(msg.domain || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");

    if (!domain) {
      sendResponse({ granted: false, error: "Missing domain" });
      return true;
    }

    chrome.permissions.request(
      { origins: [`https://${domain}/*`, `http://${domain}/*`] },
      (granted) => sendResponse({ granted })
    );
    return true;
  }
});
