// VantoOS Companion – WhatsApp Web Content Script
// Injected only when web.whatsapp.com is allowed + granted

(function () {
  // Injection guard — never inject twice
  if (window.__vantoos_wa_injected) return;
  window.__vantoos_wa_injected = true;

  if (document.getElementById("vantoos-wa-bar")) return;

  const CAPTURE_COUNT = 25;
  let currentChatKey = null;
  let currentChatTitle = null;
  let barEl = null;
  let handledEl = null;

  // ── Helpers ───────────────────────────────────────
  function sha256Hex(str) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
      .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join(""));
  }

  function waitForAll(selectors, timeout = 20000) {
    return new Promise((resolve, reject) => {
      const check = () => selectors.every(s => document.querySelector(s));
      if (check()) return resolve();
      const obs = new MutationObserver(() => {
        if (check()) { obs.disconnect(); resolve(); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error("timeout")); }, timeout);
    });
  }

  // ── Chat detection (robust, proven selectors) ─────
  function getChatTitle() {
    const selected = document.querySelector('#pane-side [aria-selected="true"] span[title]');
    if (selected) {
      const t = selected.getAttribute("title");
      if (t) return t;
    }
    const selectedAuto = document.querySelector('#pane-side [aria-selected="true"] span[dir="auto"]');
    if (selectedAuto) {
      const t = selectedAuto.textContent?.trim();
      if (t) return t;
    }
    const mainHeader = document.querySelector('#main header');
    if (mainHeader) {
      const lines = mainHeader.innerText?.split('\n');
      const first = lines?.[0]?.trim();
      if (first && first.length > 0 && first.length < 200) return first;
    }
    const headerSpan = document.querySelector('#main header span[title]');
    if (headerSpan) {
      const t = headerSpan.getAttribute("title");
      if (t) return t;
    }
    const headerAutoTitle = document.querySelector('header span[dir="auto"][title]');
    if (headerAutoTitle) {
      const t = headerAutoTitle.getAttribute("title");
      if (t) return t;
    }
    return null;
  }

  // ── Transcript Builder ────────────────────────────
  // ONLY processes rows with [data-pre-plain-text], producing clean transcript lines.
  // Filters out UI meta (reactions, forwarded labels, timestamps, voice call, etc.)

  const UI_NOISE_PATTERNS = [
    /^voice call$/i,
    /^video call$/i,
    /^missed voice call$/i,
    /^missed video call$/i,
    /^this message was deleted$/i,
    /^waiting for this message/i,
    /^you deleted this message$/i,
    /^\d{1,2}:\d{2}\s*(am|pm)?$/i,        // bare timestamps
    /^forwarded$/i,
    /^(\d+)\s*(unread|new)\s*message/i,
    /^tap to learn more$/i,
    /^reply$/i,
  ];

  function isUINoiseText(text) {
    return UI_NOISE_PATTERNS.some(p => p.test(text));
  }

  function extractCleanText(row) {
    // Try targeted selectors first (most specific → least specific)
    const selectors = [
      'span.selectable-text',
      'span[dir="auto"]',
      'span[dir="ltr"]',
      '[data-testid="msg-text"] span',
      '[data-testid="msg-text"]',
    ];

    for (const sel of selectors) {
      const el = row.querySelector(sel);
      if (!el) continue;
      const t = (el.innerText || '').trim();
      if (t.length >= 2 && !isUINoiseText(t)) {
        return t.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }

    // Fallback: clone row, strip known noise elements, use remaining text
    const clone = row.cloneNode(true);
    clone.querySelectorAll(
      '[data-testid="msg-meta"], [data-testid="msg-time"], [data-testid="recall-marker"], ' +
      '[data-testid="forward-context"], [data-testid="quoted-message"], ' +
      '[data-testid="media-caption"], .quoted-mention, [role="button"]'
    ).forEach(el => el.remove());

    let text = (clone.innerText || '').trim();
    // Strip the data-pre-plain-text header that WhatsApp prepends
    const preAttr = row.getAttribute('data-pre-plain-text') || '';
    if (preAttr) {
      const bracketMatch = preAttr.match(/\[([^\]]+)\]\s*([^:]*):?\s*/);
      if (bracketMatch && text.startsWith(bracketMatch[0])) {
        text = text.slice(bracketMatch[0].length);
      }
    }
    text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length >= 2 ? text : '';
  }

  function parsePrePlainText(attr) {
    // Format: "[12:34, 05/03/2026] Sender Name: " or "[12:34 pm, 05/03/2026] Sender: "
    const match = String(attr || '').match(/\[([^\]]+)\]\s*([^:]*?):\s*$/);
    if (!match) return { ts: null, sender: null };
    return { ts: match[1].trim(), sender: match[2].trim() || null };
  }

  function buildTranscript(count = CAPTURE_COUNT) {
    const rows = Array.from(document.querySelectorAll('#main [data-pre-plain-text]'));
    const slice = rows.slice(-count);
    const transcript = [];

    for (const row of slice) {
      const preAttr = row.getAttribute('data-pre-plain-text');
      const { ts, sender } = parsePrePlainText(preAttr);
      const text = extractCleanText(row);

      if (!text || text.length < 2) continue;
      if (isUINoiseText(text)) continue;

      // Direction
      const container = row.closest('.message-in, .message-out, [data-testid="msg-container"]') || row;
      const classes = String(container.className || '') + ' ' + String(row.className || '');
      let direction = 'unknown';
      if (classes.includes('message-out')) direction = 'me';
      else if (classes.includes('message-in')) direction = 'them';

      transcript.push({ ts, sender, direction, text });
    }

    return transcript;
  }

  // Legacy compat: getMessages returns the same shape the bar actions expect
  function getMessages(count = CAPTURE_COUNT) {
    return buildTranscript(count).map(m => ({
      text: m.text,
      direction: m.direction,
      timestamp: m.ts,
    }));
  }

  async function computeChatKey(title) {
    const hash = window.location.hash;
    if (hash && hash.includes("/chat/")) {
      const chatId = hash.split("/chat/")[1]?.split("/")[0]?.split("?")[0];
      if (chatId) return "wa:" + chatId;
    }
    const accountHint = document.querySelector('[data-testid="menu-bar-user-avatar"]')?.getAttribute("title") || "default";
    const msgs = getMessages(1);
    const firstTs = msgs[0]?.timestamp || "unknown";
    const raw = `${accountHint}|${title}|${firstTs}`;
    const hash256 = await sha256Hex(raw);
    return "wa:" + hash256.slice(0, 24);
  }

  // ── Vanto Bar UI (fixed overlay, NO body shift) ───
  function createBar() {
    if (barEl) return;

    barEl = document.createElement("div");
    barEl.id = "vantoos-wa-bar";
    Object.assign(barEl.style, {
      position: "fixed",
      top: "0",
      left: "0",
      right: "0",
      height: "36px",
      background: "linear-gradient(135deg, #0a0a0a 0%, #111 100%)",
      borderBottom: "1px solid #262626",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 12px",
      zIndex: "2147483646",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: "11px",
      color: "#e5e5e5",
      gap: "6px",
      pointerEvents: "auto",
    });

    const left = document.createElement("div");
    left.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;flex-shrink:1;overflow:hidden;";
    left.innerHTML = `<span style="color:#22c55e;font-weight:700;font-size:13px;flex-shrink:0;">V</span>
      <span id="vantoos-wa-chat-title" style="color:#888;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></span>`;

    const center = document.createElement("div");
    center.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0;";
    const btns = [
      { id: "wa-btn-task", label: "✓ Task", action: "task" },
      { id: "wa-btn-meeting", label: "📅 Meeting", action: "meeting" },
      { id: "wa-btn-reminder", label: "🔔 Reminder", action: "reminder" },
      { id: "wa-btn-notes", label: "📝 Notes", action: "notes" },
      { id: "wa-btn-smart", label: "✨ Extract", action: "smart_extract" },
    ];
    for (const b of btns) {
      const btn = document.createElement("button");
      btn.id = b.id;
      btn.textContent = b.label;
      btn.dataset.action = b.action;
      Object.assign(btn.style, {
        background: "#262626",
        color: "#e5e5e5",
        border: "1px solid #333",
        borderRadius: "4px",
        padding: "3px 8px",
        fontSize: "10px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontFamily: "inherit",
      });
      btn.addEventListener("mouseenter", () => { btn.style.background = "#333"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "#262626"; });
      btn.addEventListener("click", () => handleBarAction(b.action));
      center.appendChild(btn);
    }

    const right = document.createElement("div");
    right.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0;";

    handledEl = document.createElement("span");
    handledEl.id = "vantoos-wa-handled";
    handledEl.style.cssText = "font-size:10px;color:#666;white-space:nowrap;";
    handledEl.textContent = "Not handled yet";

    const openBtn = document.createElement("button");
    openBtn.textContent = "◧";
    openBtn.title = "Open Side Panel";
    Object.assign(openBtn.style, {
      background: "#22c55e",
      color: "#000",
      border: "none",
      borderRadius: "4px",
      padding: "3px 8px",
      fontSize: "12px",
      cursor: "pointer",
      fontWeight: "700",
      fontFamily: "inherit",
    });
    openBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
    });

    right.appendChild(handledEl);
    right.appendChild(openBtn);

    barEl.appendChild(left);
    barEl.appendChild(center);
    barEl.appendChild(right);
    document.body.appendChild(barEl);
  }

  function updateBarTitle(title) {
    const el = document.getElementById("vantoos-wa-chat-title");
    if (el) el.textContent = title || "No chat open";
  }

  function updateHandledStamp(actions) {
    if (!handledEl) return;
    if (!actions || actions.length === 0) {
      handledEl.textContent = "Not handled yet";
      handledEl.style.color = "#666";
    } else {
      handledEl.textContent = `✅ Handled: ${actions.length}`;
      handledEl.style.color = "#22c55e";
      handledEl.title = actions.map(a => `${a.action_type} – ${new Date(a.created_at).toLocaleTimeString()}`).join("\n");
    }
  }

  // ── Actions ───────────────────────────────────────
  function handleBarAction(action) {
    if (!currentChatKey) {
      showBarToast("Open a chat first");
      return;
    }

    const messages = getMessages();
    const selectedText = window.getSelection()?.toString() || "";

    if (action === "smart_extract") {
      chrome.runtime.sendMessage({
        type: "SMART_CAPTURE_WHATSAPP_CHAT",
        chat_key: currentChatKey,
        chat_title: currentChatTitle,
        messages,
        selected_text: selectedText,
      });
      showBarToast("✨ Sending to Smart Extract…");
      return;
    }

    chrome.runtime.sendMessage({
      type: "WHATSAPP_MANUAL_ACTION",
      action_type: action,
      chat_key: currentChatKey,
      chat_title: currentChatTitle,
      messages: messages.slice(-5),
      selected_text: selectedText,
    });

    showBarToast(`Opening ${action}…`);
  }

  function showBarToast(msg) {
    let toast = document.getElementById("vantoos-wa-toast");
    if (toast) toast.remove();
    toast = document.createElement("div");
    toast.id = "vantoos-wa-toast";
    Object.assign(toast.style, {
      position: "fixed",
      top: "44px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#052e16",
      border: "1px solid #166534",
      color: "#86efac",
      borderRadius: "6px",
      padding: "6px 14px",
      fontSize: "11px",
      zIndex: "2147483647",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    });
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast?.remove(), 3000);
  }

  // ── Chat change observer ──────────────────────────
  async function onChatChange() {
    const title = getChatTitle();
    console.log("[VantoOS] ChatChange title:", title);

    if (!title) {
      currentChatKey = null;
      currentChatTitle = null;
      updateBarTitle(null);
      updateHandledStamp([]);
      chrome.runtime.sendMessage({
        type: "WHATSAPP_CHAT_CONTEXT",
        chat_key: null,
        chat_title: null,
      }, () => {
        if (chrome.runtime.lastError) console.warn('[VantoOS] context send error (null)', chrome.runtime.lastError);
      });
      return;
    }

    currentChatTitle = title;
    currentChatKey = await computeChatKey(title);
    updateBarTitle(title);

    chrome.runtime.sendMessage({
      type: "WHATSAPP_CHAT_CONTEXT",
      chat_key: currentChatKey,
      chat_title: currentChatTitle,
    }, () => {
      if (chrome.runtime.lastError) console.warn('[VantoOS] context send error', chrome.runtime.lastError);
    });

    chrome.runtime.sendMessage({
      type: "GET_WHATSAPP_HANDLED",
      chat_key: currentChatKey,
    }, (res) => {
      if (res?.actions) updateHandledStamp(res.actions);
      else updateHandledStamp([]);
    });
  }

  // ── MutationObserver for chat changes ─────────────
  function observeChatChanges() {
    let lastTitle = null;
    const check = () => {
      const title = getChatTitle();
      if (title !== lastTitle) {
        lastTitle = title;
        onChatChange();
      }
    };

    setInterval(check, 1500);

    const obs = new MutationObserver(() => {
      requestAnimationFrame(check);
    });
    const app = document.getElementById("app") || document.body;
    obs.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["title", "aria-selected"] });

    // Also listen for clicks on pane-side (chat list) to detect changes faster
    document.getElementById('pane-side')?.addEventListener('click', () => setTimeout(onChatChange, 200), true);
  }

  // Listen for messages from background / sidepanel
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "WHATSAPP_HANDLED_UPDATE" && msg.chat_key === currentChatKey) {
      updateHandledStamp(msg.actions);
    }
    if (msg?.type === "WHATSAPP_TOAST") {
      showBarToast(msg.message);
    }

    // ── Snapshot API: sidepanel requests transcript from content script ──
    if (msg?.type === "WA_GET_CHAT_SNAPSHOT") {
      const count = msg.count || CAPTURE_COUNT;
      const title = getChatTitle();

      function collectDebugCounts() {
        return {
          "prePlain": document.querySelectorAll('#main [data-pre-plain-text]').length,
          "selectable": document.querySelectorAll('#main span.selectable-text').length,
          "dirAuto": document.querySelectorAll('#main span[dir="auto"]').length,
          "dirLtr": document.querySelectorAll('#main span[dir="ltr"]').length,
          "msgText": document.querySelectorAll('#main [data-testid="msg-text"]').length,
        };
      }

      let transcript = buildTranscript(count);

      // If 0 messages, do one scroll nudge to force lazy-render, then retry
      if (transcript.length === 0) {
        const scroller =
          document.querySelector('#main [data-testid="conversation-panel-messages"]') ||
          document.querySelector('#main [role="application"]') ||
          document.querySelector('#main div[tabindex="-1"]') ||
          document.querySelector('#main');

        try {
          scroller?.scrollBy?.(0, 300);
          scroller?.scrollBy?.(0, -300);
        } catch (_) {}

        setTimeout(() => {
          transcript = buildTranscript(count);
          const debugCounts = collectDebugCounts();
          sendResponse({
            chat_key: currentChatKey,
            chat_title: title || currentChatTitle,
            transcript,
            messages: transcript.map(m => ({ text: m.text, direction: m.direction, timestamp: m.ts })),
            debug: { ...debugCounts, message_count: transcript.length, retried: true },
          });
        }, 400);
        return true; // async sendResponse
      }

      const debugCounts = collectDebugCounts();
      sendResponse({
        chat_key: currentChatKey,
        chat_title: title || currentChatTitle,
        transcript,
        messages: transcript.map(m => ({ text: m.text, direction: m.direction, timestamp: m.ts })),
        debug: { ...debugCounts, message_count: transcript.length },
      });
      return true;
    }

    return false;
  });

  // ── Init ──────────────────────────────────────────
  async function init() {
    try {
      await waitForAll(["#pane-side", "#main"], 20000);
      createBar();
      observeChatChanges();
      setTimeout(onChatChange, 800);
    } catch {
      console.warn("[VantoOS] WhatsApp Web not ready — retrying with fallback");
      try {
        await waitForAll(["#pane-side"], 10000);
        createBar();
        observeChatChanges();
        setTimeout(onChatChange, 1000);
      } catch {
        console.warn("[VantoOS] WhatsApp Web init failed — bar not injected");
      }
    }
  }

  init();
})();
