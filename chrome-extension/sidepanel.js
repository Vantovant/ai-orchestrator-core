// VantoOS Companion - Side Panel Logic

const API_BASE = "https://zsvaqtlomgofwqkpwxeh.supabase.co/functions/v1";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzdmFxdGxvbWdvZndxa3B3eGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzI1OTgsImV4cCI6MjA4Nzg0ODU5OH0.Hcxiwb9kZGuoB_VjbQIRQQICJJGkZcfxsbU3LunM510";
const APP_URL = "https://vantoos-ai-core.lovable.app";

// ── State ─────────────────────────────────────────────
let state = { token: null, userId: null, projects: [], tasks: [], domains: [], captureData: null, selectedProjectId: null };

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
  if (!res.ok) {
    if (res.status === 401) {
      handleTokenExpired();
      throw new Error("Session expired");
    }
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

function handleTokenExpired() {
  state.token = null;
  state.userId = null;
  chrome.storage.local.remove(["vantoos_token", "vantoos_user_id"]);
  updateAuthUI();
  showToast("Session expired — generate a new pairing code in VantoOS Settings", "error");
  // Switch to settings tab
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.querySelector('[data-tab="settings"]').classList.add("active");
  document.getElementById("panel-settings").classList.add("active");
}

// ── Auth ──────────────────────────────────────────────
async function loadAuth() {
  const stored = await chrome.storage.local.get(["vantoos_token", "vantoos_user_id"]);
  state.token = stored.vantoos_token || null;
  state.userId = stored.vantoos_user_id || null;
  updateAuthUI();
  if (state.token) {
    loadProjects();
    loadTasks();
    loadDomains();
  }
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
    loadTasks();
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
  state.projects = [];
  state.tasks = [];
  state.domains = [];
  await chrome.storage.local.remove(["vantoos_token", "vantoos_user_id"]);
  updateAuthUI();
  renderProjects();
  renderTasks();
  renderDomains();
  showToast("Disconnected");
});

// ── Projects ──────────────────────────────────────────
async function loadProjects() {
  if (!state.token) return;
  try {
    state.projects = await apiCall("extension-projects");
    renderProjects();
  } catch (e) {
    console.error("Failed to load projects", e);
    state.projects = [];
    renderProjects();
  }
}

function renderProjects() {
  const list = document.getElementById("projects-list");
  const select = document.getElementById("capture-project");

  if (!state.projects.length) {
    list.innerHTML = '<div class="empty">No projects found</div>';
    select.innerHTML = '<option value="">No project (capture only)</option>';
    return;
  }

  list.innerHTML = state.projects.map(p => `
    <div class="card project-card" data-id="${p.id}" onclick="selectProject('${p.id}')">
      <div class="card-title">${escapeHtml(p.name)}</div>
      <div class="card-meta">${p.status || "active"}</div>
    </div>
  `).join("");

  select.innerHTML = '<option value="">No project (capture only)</option>' +
    state.projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
}

window.selectProject = (id) => {
  state.selectedProjectId = id;
  loadTasks(id);
  // Highlight
  document.querySelectorAll(".project-card").forEach(c => c.classList.remove("selected"));
  const card = document.querySelector(`.project-card[data-id="${id}"]`);
  if (card) card.classList.add("selected");
};

// ── Tasks ─────────────────────────────────────────────
async function loadTasks(projectId) {
  if (!state.token) return;
  try {
    const params = {};
    if (projectId) params.project_id = projectId;
    state.tasks = await apiCall("extension-tasks", { params });
    renderTasks();
  } catch (e) {
    console.error("Failed to load tasks", e);
    state.tasks = [];
    renderTasks();
  }
}

function renderTasks() {
  const list = document.getElementById("tasks-list");
  if (!state.tasks.length) {
    list.innerHTML = '<div class="empty">No tasks</div>';
    return;
  }

  const statusIcon = (s) => s === "done" ? "✅" : s === "in_progress" ? "🔄" : "⬜";
  const prioColor = (p) => p === "high" ? "#ef4444" : p === "medium" ? "#f59e0b" : "#6b7280";

  list.innerHTML = state.tasks.map(t => `
    <div class="card task-card">
      <div class="card-title">${statusIcon(t.status)} ${escapeHtml(t.title)}</div>
      <div class="card-meta">
        <span style="color:${prioColor(t.priority)}">${t.priority}</span>
        ${t.due_date ? ` · Due ${t.due_date}` : ""}
      </div>
    </div>
  `).join("");
}

// ── Domains ───────────────────────────────────────────
async function loadDomains() {
  if (!state.token) return;
  try {
    state.domains = await apiCall("extension-domains");
    renderDomains();
    // Request permissions for enabled domains
    const enabledDomains = state.domains.filter(d => d.enabled).map(d => d.domain);
    requestDomainPermissions(enabledDomains);
  } catch (e) {
    console.error("Failed to load domains", e);
    state.domains = [];
    renderDomains();
  }
}

function requestDomainPermissions(domains) {
  if (!domains.length) return;
  const origins = domains.flatMap(d => [`https://${d}/*`, `http://${d}/*`]);
  chrome.permissions.contains({ origins }, (has) => {
    if (!has) {
      // Can't auto-request without user gesture — will request on add
    }
  });
}

function renderDomains() {
  const list = document.getElementById("domains-list");
  if (!state.domains.length) {
    list.innerHTML = '<div class="empty">No domains configured. Add domains in VantoOS Settings or below.</div>';
    return;
  }
  list.innerHTML = state.domains.map(d => `
    <div class="domain-row">
      <span style="font-size:12px">${escapeHtml(d.domain)}</span>
      <div>
        <button class="btn btn-sm btn-secondary" onclick="toggleDomain('${d.id}', ${d.enabled})">${d.enabled ? "✅" : "❌"}</button>
        <button class="btn btn-sm btn-secondary" onclick="removeDomain('${d.id}')">🗑</button>
      </div>
    </div>
  `).join("");
}

window.toggleDomain = async (id, currentEnabled) => {
  try {
    await apiCall("extension-domains", { method: "PATCH", body: { id, enabled: !currentEnabled } });
    loadDomains();
  } catch (e) {
    showToast(e.message, "error");
  }
};

window.removeDomain = async (id) => {
  try {
    await apiCall("extension-domains", { method: "DELETE", body: { id } });
    showToast("Domain removed");
    loadDomains();
  } catch (e) {
    showToast(e.message, "error");
  }
};

document.getElementById("btn-add-domain").addEventListener("click", async () => {
  const input = document.getElementById("new-domain-input");
  const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain) return;

  try {
    await apiCall("extension-domains", { method: "POST", body: { domain } });
    input.value = "";
    showToast(`Added ${domain}`);
    loadDomains();

    // Request permission for the new domain
    chrome.permissions.request({
      origins: [`https://${domain}/*`, `http://${domain}/*`]
    }, (granted) => {
      if (granted) showToast(`Permission granted for ${domain}`);
    });
  } catch (e) {
    showToast(e.message, "error");
  }
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

    if (result.deep_link_url) {
      btn.innerHTML = `✅ Done — <a href="#" class="link" id="deep-link-btn">View in VantoOS →</a>`;
      // Use event listener to open in new tab
      setTimeout(() => {
        const link = document.getElementById("deep-link-btn");
        if (link) {
          link.addEventListener("click", (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: result.deep_link_url });
          });
        }
      }, 0);
    } else {
      btn.textContent = "✅ Captured!";
    }
    setTimeout(() => { btn.disabled = false; btn.textContent = "Send to Project"; }, 5000);
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

// ── Utilities ─────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ── Init ──────────────────────────────────────────────
loadAuth();
