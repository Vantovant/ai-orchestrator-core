// VantoOS Companion – WhatsApp Web Content Script
// Injected only when web.whatsapp.com is allowed + granted

(function () {
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

  function waitFor(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { obs.disconnect(); resolve(found); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error("timeout")); }, timeout);
    });
  }

  // ── Chat detection ────────────────────────────────
  function getChatTitle() {
    const headerEl = document.querySelector('header span[dir="auto"][title]')
      || document.querySelector('header [data-testid="conversation-info-header"] span[dir="auto"]')
      || document.querySelector('#main header span[title]');
    return headerEl?.getAttribute("title") || headerEl?.textContent?.trim() || null;
  }

  function getMessages(count = CAPTURE_COUNT) {
    const msgs = [];
    const containers = document.querySelectorAll('[data-testid="msg-container"], .message-in, .message-out, [class*="message-"]');
    const msgEls = containers.length ? containers : document.querySelectorAll('div.copyable-text[data-pre-plain-text]');
    const allMsgEls = Array.from(msgEls).slice(-count);

    for (const el of allMsgEls) {
      const textEl = el.querySelector('span.selectable-text') || el.querySelector('[class*="selectable-text"]');
      const text = textEl?.innerText?.trim();
      if (!text) continue;

      let direction = "unknown";
      const classes = el.className + " " + (el.closest("[class*='message-']")?.className || "");
      if (classes.includes("message-out")) direction = "me";
      else if (classes.includes("message-in")) direction = "them";

      let timestamp = null;
      const preAttr = el.getAttribute("data-pre-plain-text") || el.querySelector("[data-pre-plain-text]")?.getAttribute("data-pre-plain-text");
      if (preAttr) {
        const match = preAttr.match(/\[([^\]]+)\]/);
        if (match) timestamp = match[1];
      }

      msgs.push({ text, direction, timestamp });
    }
    return msgs;
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

    // Left: Vanto logo + chat title
    const left = document.createElement("div");
    left.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;flex-shrink:1;overflow:hidden;";
    left.innerHTML = `<span style="color:#22c55e;font-weight:700;font-size:13px;flex-shrink:0;">V</span>
      <span id="vantoos-wa-chat-title" style="color:#888;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></span>`;

    // Center: Action buttons
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

    // Right: Handled stamp + Open Panel
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

    // DO NOT modify body layout — bar is a fixed overlay only
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

    // Manual actions: open side panel with pre-filled data
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
    if (!title) {
      currentChatKey = null;
      currentChatTitle = null;
      updateBarTitle(null);
      updateHandledStamp([]);
      // Broadcast null context
      chrome.runtime.sendMessage({
        type: "WHATSAPP_CHAT_CONTEXT",
        chat_key: null,
        chat_title: null,
      });
      return;
    }

    currentChatTitle = title;
    currentChatKey = await computeChatKey(title);
    updateBarTitle(title);

    // Broadcast context to background (single source of truth)
    chrome.runtime.sendMessage({
      type: "WHATSAPP_CHAT_CONTEXT",
      chat_key: currentChatKey,
      chat_title: currentChatTitle,
    });

    // Fetch handled status
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
    obs.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["title"] });
  }

  // Listen for handled stamp updates from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "WHATSAPP_HANDLED_UPDATE" && msg.chat_key === currentChatKey) {
      updateHandledStamp(msg.actions);
    }
    if (msg?.type === "WHATSAPP_TOAST") {
      showBarToast(msg.message);
    }
  });

  // ── Init ──────────────────────────────────────────
  async function init() {
    try {
      await waitFor('#app [data-testid="chat-list"], #app .two, #app [role="application"]', 20000);
      createBar();
      observeChatChanges();
      setTimeout(onChatChange, 1000);
    } catch {
      console.warn("[VantoOS] WhatsApp Web not ready");
    }
  }

  init();
})();
