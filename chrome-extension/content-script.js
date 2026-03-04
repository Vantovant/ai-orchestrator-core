// VantoOS Companion – Floating Action Button (Content Script)
// Injected only on allowed domains via dynamic registration in background.js

(function () {
  if (document.getElementById("vantoos-fab")) return; // already injected

  const fab = document.createElement("button");
  fab.id = "vantoos-fab";
  fab.textContent = "V";
  fab.title = "Open VantoOS Companion";
  Object.assign(fab.style, {
    position: "fixed",
    right: "16px",
    bottom: "80px",
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: "#111",
    color: "#22c55e",
    border: "2px solid #22c55e",
    fontSize: "16px",
    fontWeight: "700",
    cursor: "pointer",
    zIndex: "2147483647",
    boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform 0.2s, box-shadow 0.2s",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  });

  fab.addEventListener("mouseenter", () => {
    fab.style.transform = "scale(1.1)";
    fab.style.boxShadow = "0 4px 20px rgba(34,197,94,0.4)";
  });
  fab.addEventListener("mouseleave", () => {
    fab.style.transform = "scale(1)";
    fab.style.boxShadow = "0 2px 12px rgba(0,0,0,0.5)";
  });

  fab.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }, (res) => {
      if (chrome.runtime.lastError || res?.error) {
        // Show tooltip
        showFabTooltip(res?.error || "Pair extension in Settings first");
      }
    });
  });

  function showFabTooltip(msg) {
    let tip = document.getElementById("vantoos-fab-tip");
    if (tip) tip.remove();
    tip = document.createElement("div");
    tip.id = "vantoos-fab-tip";
    tip.textContent = msg;
    Object.assign(tip.style, {
      position: "fixed",
      right: "64px",
      bottom: "88px",
      background: "#1a1a1a",
      color: "#e5e5e5",
      border: "1px solid #333",
      borderRadius: "6px",
      padding: "6px 10px",
      fontSize: "11px",
      zIndex: "2147483647",
      maxWidth: "200px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    });
    document.body.appendChild(tip);
    setTimeout(() => tip?.remove(), 3000);
  }

  document.body.appendChild(fab);
})();
