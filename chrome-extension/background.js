// VantoOS Companion - Background Service Worker

chrome.action.onClicked.addListener(() => {
  chrome.sidePanel.open({ windowId: undefined });
});

// Listen for messages from side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CAPTURE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) { sendResponse({ error: "No active tab" }); return; }

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => ({
            url: window.location.href,
            title: document.title,
            selectedText: window.getSelection()?.toString() || "",
            metaDescription: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
          }),
        });
        sendResponse({ data: results[0]?.result });
      } catch (e) {
        sendResponse({ error: e.message });
      }
    });
    return true; // async response
  }

  if (msg.type === "REQUEST_DOMAIN_PERMISSION") {
    chrome.permissions.request(
      { origins: [`https://${msg.domain}/*`] },
      (granted) => sendResponse({ granted })
    );
    return true;
  }
});
