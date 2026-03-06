// VantoOS Companion - Background Service Worker (MV3)

const API_BASE = "https://zsvaqtlomgofwqkpwxeh.supabase.co/functions/v1";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzdmFxdGxvbWdvZndxa3B3eGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzI1OTgsImV4cCI6MjA4Nzg0ODU5OH0.Hcxiwb9kZGuoB_VjbQIRQQICJJGkZcfxsbU3LunM510";

// ── Helpers ───────────────────────────────────────────
async function getToken() {
  const stored = await chrome.storage.local.get(["vantoos_token"]);
  return stored.vantoos_token || null;
}

async function apiCall(fnName, { method = "GET", body, params } = {}) {
  const token = await getToken();
  if (!token) throw new Error("Not connected");
  const url = new URL(`${API_BASE}/${fnName}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const headers = { "Content-Type": "application/json", "apikey": ANON_KEY, "x-extension-token": token };
  const res = await fetch(url.toString(), { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Open side panel ───────────────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      return;
    }
    const win = await chrome.windows.getCurrent();
    if (win?.id) await chrome.sidePanel.open({ windowId: win.id });
  } catch (err) {
    console.error("Failed to open side panel:", err);
  }
});

// ── Inject content scripts on allowed domains ─────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab?.url) return;
  try {
    const hostname = new URL(tab.url).hostname;
    const hasPermission = await new Promise(resolve =>
      chrome.permissions.contains({ origins: [`https://${hostname}/*`, `http://${hostname}/*`] }, resolve)
    );
    if (!hasPermission) return;

    const stored = await chrome.storage.local.get(["vantoos_allowed_domains"]);
    const allowed = stored.vantoos_allowed_domains || [];
    if (!allowed.includes(hostname)) return;

    // Inject WhatsApp-specific content script for web.whatsapp.com
    if (hostname === "web.whatsapp.com") {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["whatsapp-content-script.js"],
      });
    } else {
      // Standard FAB content script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content-script.js"],
      });
    }
  } catch (_) { /* ignore non-injectable tabs like chrome:// */ }
});

// ── Message handler ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return false;

  // Open side panel from content script
  if (msg.type === "OPEN_SIDE_PANEL") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ error: "Pair extension in Settings first" });
      return true;
    }
    chrome.sidePanel.open({ tabId }).then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err?.message || "Failed" }));
    return true;
  }

  // Quick capture: basic tab info + selection
  if (msg.type === "CAPTURE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        const tab = tabs?.[0];
        if (!tab?.id) { sendResponse({ error: "No active tab" }); return; }
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            url: window.location.href,
            title: document.title,
            selectedText: window.getSelection()?.toString() || "",
            metaDescription: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
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
  if (msg.type === "SMART_CAPTURE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      try {
        const tab = tabs?.[0];
        if (!tab?.id) { sendResponse({ error: "No active tab" }); return; }
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const MAX_TEXT_CHARS = 8000;
            const MAX_HEADINGS = 30;
            const MAX_TABLES = 3;
            const MAX_TABLE_ROWS = 30;
            const url = window.location.href;
            const title = document.title;
            const selectedText = window.getSelection()?.toString() || "";
            const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
            const headingEls = document.querySelectorAll("h1, h2, h3");
            const headings = [];
            for (let i = 0; i < Math.min(headingEls.length, MAX_HEADINGS); i++) {
              const txt = (headingEls[i].textContent || "").trim();
              if (txt) headings.push(`${headingEls[i].tagName}: ${txt}`);
            }
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
            const tables = [];
            const tableEls = document.querySelectorAll("table");
            let totalRows = 0;
            for (let t = 0; t < Math.min(tableEls.length, MAX_TABLES); t++) {
              const rows = tableEls[t].querySelectorAll("tr");
              const tableData = [];
              for (let r = 0; r < rows.length && totalRows < MAX_TABLE_ROWS; r++) {
                const cells = rows[r].querySelectorAll("th, td");
                const rowData = [];
                for (const cell of cells) rowData.push((cell.textContent || "").trim().slice(0, 200));
                tableData.push(rowData);
                totalRows++;
              }
              if (tableData.length) tables.push(tableData);
            }
            const formFields = [];
            const inputs = document.querySelectorAll("input, select, textarea");
            for (const inp of inputs) {
              if (formFields.length >= 20) break;
              const label = inp.getAttribute("aria-label") || inp.getAttribute("placeholder") || (inp.labels?.[0]?.textContent || "").trim() || inp.getAttribute("name") || "";
              if (!label) continue;
              let value = inp.value || "";
              if (/email|phone|tel|ssn|id.?num/i.test(label) || /\d{10,}/.test(value)) value = "[REDACTED]";
              formFields.push({ label: label.slice(0, 100), value: value.slice(0, 100) });
            }
            const bodyText = document.body?.innerText || "";
            const entities = [];
            const amountMatches = bodyText.match(/[R$€£]\s?[\d,]+(?:\.\d{1,2})?/g);
            if (amountMatches) for (const m of amountMatches.slice(0, 10)) entities.push({ type: "amount", value: m.trim() });
            const dateMatches = bodyText.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}\b/gi);
            if (dateMatches) for (const m of dateMatches.slice(0, 10)) entities.push({ type: "date", value: m.trim() });
            const refMatches = bodyText.match(/\b(?:REF|INV|PO|ORDER|QUOTE|#)\s?[:\-]?\s?[A-Z0-9\-]{4,20}\b/gi);
            if (refMatches) for (const m of refMatches.slice(0, 10)) entities.push({ type: "reference", value: m.trim() });
            return { url, title, selectedText, metaDescription, headings, textBlocks, tables, formFields, entities };
          },
        });
        sendResponse({ data: results?.[0]?.result || null });
      } catch (e) {
        sendResponse({ error: e?.message || String(e) });
      }
    });
    return true;
  }

  // Request domain permission
  if (msg.type === "REQUEST_DOMAIN_PERMISSION") {
    const domain = String(msg.domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!domain) { sendResponse({ granted: false, error: "Missing domain" }); return true; }
    chrome.permissions.request({ origins: [`https://${domain}/*`, `http://${domain}/*`] },
      (granted) => sendResponse({ granted }));
    return true;
  }

  // ── WhatsApp-specific messages ──────────────────────

  // Get active tab info (for sidepanel to detect WhatsApp)
  if (msg.type === "GET_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs?.[0];
      sendResponse({ url: tab?.url || "", title: tab?.title || "" });
    });
    return true;
  }

  // Smart capture WhatsApp chat (from content script)
  if (msg.type === "SMART_CAPTURE_WHATSAPP_CHAT") {
    (async () => {
      try {
        const result = await apiCall("smart-capture-whatsapp", {
          method: "POST",
          body: {
            chat_key: msg.chat_key,
            chat_title: msg.chat_title,
            messages: msg.messages,
            selected_text: msg.selected_text,
            user_context: { locale: "ZA", currency_default: "ZAR" },
          },
        });
        // Forward result to sidepanel
        chrome.runtime.sendMessage({ type: "WHATSAPP_SMART_RESULT", result });
        // Notify content script
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, { type: "WHATSAPP_TOAST", message: "✨ Smart Extract complete — check side panel" });
        }
      } catch (e) {
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, { type: "WHATSAPP_TOAST", message: `❌ ${e.message}` });
        }
      }
    })();
    sendResponse({ ok: true });
    return true;
  }

  // Manual action from WhatsApp bar (forwarded to sidepanel)
  if (msg.type === "WHATSAPP_MANUAL_ACTION") {
    // Open side panel first, then forward
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.sidePanel.open({ tabId }).then(() => {
        // Small delay to let sidepanel load
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: "WHATSAPP_PREFILL_ACTION",
            action_type: msg.action_type,
            chat_key: msg.chat_key,
            chat_title: msg.chat_title,
            messages: msg.messages,
            selected_text: msg.selected_text,
          });
        }, 500);
      }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  // Get WhatsApp handled status (from content script)
  if (msg.type === "GET_WHATSAPP_HANDLED") {
    (async () => {
      try {
        const result = await apiCall("whatsapp-action-log", {
          method: "GET",
          params: { chat_key: msg.chat_key },
        });
        sendResponse({ actions: result.actions || [] });
      } catch {
        sendResponse({ actions: [] });
      }
    })();
    return true;
  }

  // Log WhatsApp action (from sidepanel)
  if (msg.type === "LOG_WHATSAPP_ACTION") {
    (async () => {
      try {
        const result = await apiCall("whatsapp-action-log", {
          method: "POST",
          body: {
            chat_key: msg.chat_key,
            chat_title: msg.chat_title,
            action_type: msg.action_type,
            related_id: msg.related_id,
            meta: msg.meta,
          },
        });
        sendResponse(result);
        // Notify content script to update stamp
        chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, {
                type: "WHATSAPP_HANDLED_UPDATE",
                chat_key: msg.chat_key,
                actions: result.actions || [],
              });
            }
          }
        });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // Create task for WhatsApp (reuses extension-task-create with dedupe)
  if (msg.type === "CREATE_WHATSAPP_TASK") {
    (async () => {
      try {
        const result = await apiCall("extension-task-create", {
          method: "POST",
          body: {
            title: msg.title,
            priority: msg.priority || "medium",
            project_id: msg.project_id || undefined,
            source: "whatsapp",
            dedupe_key: msg.dedupe_key,
          },
        });
        sendResponse(result);
      } catch (e) {
        sendResponse({ error: e.message });
      }
    })();
    return true;
  }

  // Draft reply into WhatsApp composer
  if (msg.type === "DRAFT_WHATSAPP_REPLY") {
    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, async (tabs) => {
      const tab = tabs?.[0];
      if (!tab?.id) { sendResponse({ error: "No WhatsApp tab" }); return; }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (text) => {
            // Find the WhatsApp composer input
            const composer = document.querySelector('[data-testid="conversation-compose-box-input"]')
              || document.querySelector('footer [contenteditable="true"]')
              || document.querySelector('[role="textbox"][contenteditable="true"]');
            if (!composer) return;
            // Insert text (does NOT send)
            composer.focus();
            document.execCommand("insertText", false, text);
          },
          args: [msg.text],
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ error: e?.message || String(e) });
      }
    });
    return true;
  }

  return false;
});
