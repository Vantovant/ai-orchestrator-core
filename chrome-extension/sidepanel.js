// VantoOS Companion - Side Panel Logic

const API_BASE = "https://zsvaqtlomgofwqkpwxeh.supabase.co/functions/v1";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzdmFxdGxvbWdvZndxa3B3eGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzI1OTgsImV4cCI6MjA4Nzg0ODU5OH0.Hcxiwb9kZGuoB_VjbQIRQQICJJGkZcfxsbU3LunM510";
const APP_URL = "https://vantoos-ai-core.lovable.app";

// ── State ─────────────────────────────────────────────
let state = { token: null, userId: null, projects: [], tasks: [], domains: [], captureData: null };

// ── Helpers ───────────────────────────────────────────
function showToast(msg, type = "success") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function apiCall(fnName, { method = "GET", body, params, useExtToken = true } = {}) {
  const url = new URL(`${API_BASE}/${fnName}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers = { "Content-Type": "application/json", "apikey": ANON_KEY };
  if (useExtToken && state.token) headers["x-extension-token"] = state.token;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Auth ──────────────────────────────────────────────
async function loadAuth() {
  const stored = await chrome.storage.local.get(["vantoos_token", "vantoos_user_id"]);
  state.token = stored.vantoos_token || null;
  state.userId = stored.vantoos_user_id || null;
  updateAuthUI();
  if (state.token) { loadProjects(); loadDomains(); }
}

function updateAuthUI() {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  const pairInput = document.getElementById("pairing-code-input");
  const btnPair = document.getElementById("btn-pair");
  const btnDisconnect = document.getElementById("btn-disconnect");

  if (state.token) {
    dot.className = "status-dot status-connected";
    text.textContent = "Connected to VantoOS";
    pairInput.style.display = "none";
    btnPair.style.display = "none";
    btnDisconnect.style.display = "inline-flex";
  } else {
    dot.className = "status-dot status-disconnected";
    text.textContent = "Not connected";
    pairInput.style.display = "";
    btnPair.style.display = "";
    btnDisconnect.style.display = "none";
  }
}

document.getElementById("btn-pair").addEventListener("click", async () => {
  const code = document.getElementById("pairing-code-input").value.trim();
  if (!code) return showToast("Enter a pairing code", "error");

  try {
    document.getElementById("btn-pair").disabled = true;
    document.getElementById("btn-pair").innerHTML = '<span class="spinner"></span>';
    const data = await apiCall("extension-exchange", { method: "POST", body: { code }, useExtToken: false });
    state.token = data.access_token;
    state.userId = data.user_id;
    await chrome.storage.local.set({ vantoos_token: data.access_token, vantoos_user_id: data.user_id });
    updateAuthUI();
    showToast("✅ Paired with VantoOS!");
    loadProjects();
    loadDomains();
  } catch (e) {
    showToast(e.message, "error");
  } finally {
    document.getElementById("btn-pair").disabled = false;
    document.getElementById("btn-pair").textContent = "Pair";
  }
});

document.getElementById("btn-disconnect").addEventListener("click", async () => {
  state.token = null;
  state.userId = null;
  await chrome.storage.local.remove(["vantoos_token", "vantoos_user_id"]);
  updateAuthUI();
  showToast("Disconnected");
});

// ── Projects ──────────────────────────────────────────
async function loadProjects() {
  if (!state.token) return;
  // Use the Supabase REST API directly for projects
  try {
    const url = `https://zsvaqtlomgofwqkpwxeh.supabase.co/rest/v1/projects?select=id,name,status&deleted_at=is.null&order=updated_at.desc&limit=50`;
    const res = await fetch(url, {
      headers: {
        "apikey": ANON_KEY,
        "Authorization": `Bearer ${ANON_KEY}`,
        "x-extension-token": state.token,
      },
    });
    // Note: REST API doesn't support extension token. We'll use a dedicated edge function.
    // For now, store empty and show message
    state.projects = [];
    renderProjects();
  } catch (e) {
    console.error("Failed to load projects", e);
  }
}

function renderProjects() {
  const list = document.getElementById("projects-list");
  const select = document.getElementById("capture-project");

  if (!state.projects.length) {
    list.innerHTML = '<div class="empty">Connect via Settings to see projects</div>';
    select.innerHTML = '<option value="">Connect first…</option>';
    return;
  }

  list.innerHTML = state.projects.map(p => `
    <div class="card">
      <div class="card-title">${p.name}</div>
      <div class="card-meta">${p.status || "active"}</div>
    </div>
  `).join("");

  select.innerHTML = '<option value="">Select project…</option>' +
    state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
}

// ── Domains ───────────────────────────────────────────
async function loadDomains() {
  // Will load from backend when connected
  const stored = await chrome.storage.local.get("vantoos_domains");
  state.domains = stored.vantoos_domains || [
    { domain: "dashboard.onlinecourseformlm.com", enabled: true },
    { domain: "crm.onlinecourseformlm.com", enabled: true },
    { domain: "onlinecourseformlm.com", enabled: true },
    { domain: "chat.onlinecourseformlm.com", enabled: true },
  ];
  renderDomains();
}

function renderDomains() {
  const list = document.getElementById("domains-list");
  if (!state.domains.length) {
    list.innerHTML = '<div class="empty">No domains configured</div>';
    return;
  }
  list.innerHTML = state.domains.map((d, i) => `
    <div class="domain-row">
      <span style="font-size:12px">${d.domain}</span>
      <div>
        <button class="btn btn-sm btn-secondary" onclick="toggleDomain(${i})">${d.enabled ? "✅" : "❌"}</button>
        <button class="btn btn-sm btn-secondary" onclick="removeDomain(${i})">🗑</button>
      </div>
    </div>
  `).join("");
}

window.toggleDomain = (i) => {
  state.domains[i].enabled = !state.domains[i].enabled;
  chrome.storage.local.set({ vantoos_domains: state.domains });
  renderDomains();
};

window.removeDomain = (i) => {
  state.domains.splice(i, 1);
  chrome.storage.local.set({ vantoos_domains: state.domains });
  renderDomains();
};

document.getElementById("btn-add-domain").addEventListener("click", () => {
  const input = document.getElementById("new-domain-input");
  const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain) return;
  if (state.domains.some(d => d.domain === domain)) {
    showToast("Domain already exists", "error");
    return;
  }
  state.domains.push({ domain, enabled: true });
  chrome.storage.local.set({ vantoos_domains: state.domains });
  renderDomains();
  input.value = "";
  showToast(`Added ${domain}`);

  // Request permission
  chrome.runtime.sendMessage({ type: "REQUEST_DOMAIN_PERMISSION", domain }, (res) => {
    if (res?.granted) showToast(`Permission granted for ${domain}`);
  });
});

// ── Capture ───────────────────────────────────────────
document.getElementById("btn-refresh-capture").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "CAPTURE_TAB" }, (res) => {
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    state.captureData = res.data;
    const preview = document.getElementById("capture-preview");
    preview.style.display = "block";
    document.getElementById("capture-url").textContent = res.data.url;
    document.getElementById("capture-title").textContent = res.data.title;
    document.getElementById("capture-snippet").textContent = res.data.selectedText || "(no text selected)";

    // Check if domain is allowed
    const domain = new URL(res.data.url).hostname;
    const allowed = state.domains.some(d => d.domain === domain && d.enabled);
    const btn = document.getElementById("btn-send-capture");
    if (!allowed) {
      btn.disabled = true;
      btn.textContent = `⚠ "${domain}" not in allowlist`;
      document.getElementById("capture-status").innerHTML =
        `<div class="card" style="border-color:#7f1d1d;margin-bottom:12px"><span style="font-size:12px;color:#fca5a5">Domain not allowed. Add it in Settings → Allowed Domains.</span></div>`;
    } else {
      btn.disabled = false;
      btn.textContent = "Send to Project";
      document.getElementById("capture-status").innerHTML = "";
    }
  });
});

document.getElementById("btn-send-capture").addEventListener("click", async () => {
  if (!state.captureData || !state.token) return;
  const projectId = document.getElementById("capture-project").value;

  const btn = document.getElementById("btn-send-capture");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending…';

  try {
    const result = await apiCall("capture-web", {
      method: "POST",
      body: {
        url: state.captureData.url,
        title: state.captureData.title,
        selected_text: state.captureData.selectedText,
        page_summary: state.captureData.metaDescription,
        project_id: projectId || undefined,
        metadata: { source: "chrome-extension" },
      },
    });
    const actionText = result.action === "merged" ? "Merged" : "Captured";
    showToast(`✅ ${actionText}${projectId ? " to project" : ""}!`);
    if (result.project_id) {
      btn.innerHTML = `✅ Done — <a href="${APP_URL}/projects/${result.project_id}" target="_blank" class="link">View in VantoOS →</a>`;
    } else {
      btn.textContent = "✅ Captured!";
    }
    setTimeout(() => { btn.disabled = false; btn.textContent = "Send to Project"; }, 3000);
  } catch (e) {
    showToast(`❌ ${e.message}`, "error");
    btn.disabled = false;
    btn.textContent = "Send to Project";
  }
});

// ── Tabs ──────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Init ──────────────────────────────────────────────
loadAuth();
