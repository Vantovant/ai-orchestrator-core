// VantoOS Companion - Background Service Worker (MV3)

// Open the side panel for the tab the user clicked from
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      return;
    }

    // Fallback: try current window if tab isn't available
    const win = await chrome.windows.getCurrent();
    if (win?.id) {
      await chrome.sidePanel.open({ windowId: win.id });
    }
  } catch (err) {
    console.error("Failed to open side panel:", err);
  }
});

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Capture current tab info + selection
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
              document
                .querySelector('meta[name="description"]')
                ?.getAttribute("content") || "",
          }),
        });

        sendResponse({ data: results?.[0]?.result || null });
      } catch (e) {
        sendResponse({ error: e?.message || String(e) });
      }
    });

    return true; // async response
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