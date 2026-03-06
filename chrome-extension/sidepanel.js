// VantoOS Companion - Side Panel Logic

const API_BASE = "https://zsvaqtlomgofwqkpwxeh.supabase.co/functions/v1";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzdmFxdGxvbWdvZndxa3B3eGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzI1OTgsImV4cCI6MjA4Nzg0ODU5OH0.Hcxiwb9kZGuoB_VjbQIRQQICJJGkZcfxsbU3LunM510";
const APP_URL = "https://vantoos-ai-core.lovable.app";

// ── State ─────────────────────────────────────────────
let state = {
  token: null, userId: null, projects: [], tasks: [], domains: [],
  captureData: null, selectedProjectId: null, domainPermissions: {},
  smartCaptureResult: null, currentTab: "capture",
};

// ── Helpers ───────────────────────────────────────────
function showToast(msg, type = "success") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function showAssistedReminder(remaining) {
  const existing = document.getElementById("assisted-reminder-banner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "assisted-reminder-banner";
  banner.style.cssText = "background:#1a1a2e;border:1px solid #4ade80;border-radius:8px;padding:10px 12px;margin:8px 0;font-size:11px;color:#d1d5db;";

  if (remaining <= 0) {
    banner.style.borderColor = "#ef4444";
    banner.innerHTML = `
      <div style="color:#fca5a5;font-weight:600;margin-bottom:4px">Assisted mode is now finished</div>
      <div>Add your API key in Settings → AI Keys to continue using Smart Capture & Assistant.</div>
      <button onclick="window.open('${APP_URL}/settings','_blank')" style="margin-top:6px;background:#4ade80;color:#000;border:none;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;font-weight:600">Open Settings → AI Keys</button>
    `;
  } else {
    banner.innerHTML = `
      <div style="color:#4ade80;font-weight:600;margin-bottom:2px">Connect your own API key to keep AI running smoothly</div>
      <div>Assisted uses remaining: <strong style="color:#fff">${remaining}</strong></div>
      <a href="${APP_URL}/settings" target="_blank" style="color:#4ade80;text-decoration:underline;font-size:10px">Settings → AI Keys</a>
    `;
  }

  const resultsEl = document.getElementById("smart-capture-results") || document.getElementById("panel-capture");
  if (resultsEl) resultsEl.prepend(banner);
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
    if (res.status === 402) {
      throw new Error(data.message || "To guarantee data sovereignty, connect your personal OpenAI or Gemini key in Settings → AI Keys.");
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
  switchToTab("settings");
}

function switchToTab(tabName) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  const tab = document.querySelector(`[data-tab="${tabName}"]`);
  if (tab) tab.classList.add("active");
  const panel = document.getElementById(`panel-${tabName}`);
  if (panel) panel.classList.add("active");
  state.currentTab = tabName;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
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
  state.domainPermissions = {};
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
  const prioColor = (p) => p === "critical" ? "#dc2626" : p === "high" ? "#ef4444" : p === "medium" ? "#f59e0b" : "#6b7280";

  list.innerHTML = state.tasks.map(t => `
    <div class="card task-card">
      <div class="card-title">${statusIcon(t.status)} ${escapeHtml(t.title)}</div>
      <div class="card-meta">
        <span style="color:${prioColor(t.priority)}">${t.priority || "medium"}</span>
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
    await checkAllDomainPermissions();
    renderDomains();
    const allowedDomains = state.domains.filter(d => d.enabled).map(d => d.domain);
    chrome.storage.local.set({ vantoos_allowed_domains: allowedDomains });
  } catch (e) {
    console.error("Failed to load domains", e);
    state.domains = [];
    renderDomains();
  }
}

async function checkAllDomainPermissions() {
  for (const d of state.domains) {
    const granted = await checkDomainPermission(d.domain);
    state.domainPermissions[d.domain] = granted;
  }
}

function checkDomainPermission(domain) {
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: [`https://${domain}/*`, `http://${domain}/*`] }, resolve);
  });
}

function renderDomains() {
  const list = document.getElementById("domains-list");
  if (!state.domains.length) {
    list.innerHTML = '<div class="empty">No domains configured. Add domains in VantoOS Settings or below.</div>';
    return;
  }
  list.innerHTML = state.domains.map(d => {
    const hasPermission = state.domainPermissions[d.domain];
    const permBadge = d.enabled
      ? (hasPermission
        ? '<span style="color:#22c55e;font-size:11px">✓ Granted</span>'
        : `<button class="btn btn-sm btn-primary" onclick="grantDomainAccess('${escapeHtml(d.domain)}')">Grant Access</button>`)
      : '';
    return `
      <div class="domain-row">
        <div style="display:flex;flex-direction:column;gap:2px">
          <span style="font-size:12px">${escapeHtml(d.domain)}</span>
          ${permBadge}
        </div>
        <div>
          <button class="btn btn-sm btn-secondary" onclick="toggleDomain('${d.id}', ${d.enabled})">${d.enabled ? "✅" : "❌"}</button>
          <button class="btn btn-sm btn-secondary" onclick="removeDomain('${d.id}')">🗑</button>
        </div>
      </div>
    `;
  }).join("");

  const needsGrant = state.domains.some(d => d.enabled && !state.domainPermissions[d.domain]);
  const grantAllBtn = document.getElementById("btn-grant-all");
  if (grantAllBtn) grantAllBtn.style.display = needsGrant ? "" : "none";
}

window.grantDomainAccess = (domain) => {
  chrome.permissions.request({
    origins: [`https://${domain}/*`, `http://${domain}/*`]
  }, (granted) => {
    if (granted) {
      state.domainPermissions[domain] = true;
      renderDomains();
      showToast(`Permission granted for ${domain}`);
    } else {
      showToast("Permission denied", "error");
    }
  });
};

window.grantAllDomains = () => {
  const enabledDomains = state.domains.filter(d => d.enabled && !state.domainPermissions[d.domain]);
  if (!enabledDomains.length) return;
  const origins = enabledDomains.flatMap(d => [`https://${d.domain}/*`, `http://${d.domain}/*`]);
  chrome.permissions.request({ origins }, (granted) => {
    if (granted) {
      enabledDomains.forEach(d => { state.domainPermissions[d.domain] = true; });
      renderDomains();
      showToast(`Granted access to ${enabledDomains.length} domain(s)`);
    } else {
      showToast("Permission denied", "error");
    }
  });
};

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

    chrome.permissions.request({
      origins: [`https://${domain}/*`, `http://${domain}/*`]
    }, (granted) => {
      if (granted) {
        state.domainPermissions[domain] = true;
        renderDomains();
        showToast(`Permission granted for ${domain}`);
      }
    });
  } catch (e) {
    showToast(e.message, "error");
  }
});

document.getElementById("btn-grant-all").addEventListener("click", () => {
  window.grantAllDomains();
});

// ── Quick Capture ─────────────────────────────────────
function checkCapturePermissions(captureData) {
  const domain = new URL(captureData.url).hostname;
  const domainEntry = state.domains.find(d => d.domain === domain && d.enabled);
  const hasPermission = state.domainPermissions[domain];
  const btn = document.getElementById("btn-send-capture");
  const statusEl = document.getElementById("capture-status");

  if (!domainEntry) {
    btn.disabled = true;
    btn.textContent = `⚠ "${domain}" not in allowlist`;
    btn.style.display = "block";
    statusEl.innerHTML =
      `<div class="card" style="border-color:#7f1d1d;margin-bottom:12px"><span style="font-size:12px;color:#fca5a5">Domain not allowed. Add it in Settings → Allowed Domains.</span></div>`;
    return false;
  } else if (!hasPermission) {
    btn.disabled = true;
    btn.textContent = `⚠ Access not granted`;
    btn.style.display = "block";
    statusEl.innerHTML =
      `<div class="card" style="border-color:#92400e;margin-bottom:12px"><span style="font-size:12px;color:#fcd34d">Domain enabled but access not granted yet. Go to Settings and press "Grant Access" for ${escapeHtml(domain)}.</span></div>`;
    return false;
  } else {
    btn.disabled = false;
    btn.textContent = "Send to Project";
    btn.style.display = "block";
    statusEl.innerHTML = "";
    return true;
  }
}

document.getElementById("btn-quick-capture").addEventListener("click", () => {
  document.getElementById("smart-capture-results").style.display = "none";
  document.getElementById("capture-deep-link").style.display = "none";
  const assistedBanner = document.getElementById("assisted-reminder-banner");
  if (assistedBanner) assistedBanner.remove();

  chrome.runtime.sendMessage({ type: "CAPTURE_TAB" }, async (res) => {
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

    checkCapturePermissions(res.data);
  });
});

document.getElementById("btn-send-capture").addEventListener("click", async () => {
  if (!state.captureData || !state.token) return;
  const projectId = document.getElementById("capture-project").value;

  const btn = document.getElementById("btn-send-capture");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending…';

  const deepLinkContainer = document.getElementById("capture-deep-link");
  deepLinkContainer.style.display = "none";

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
    btn.textContent = `✅ ${actionText}!`;

    if (result.deep_link_url) {
      deepLinkContainer.style.display = "block";
      document.getElementById("btn-view-vantoos").onclick = () => {
        chrome.tabs.create({ url: result.deep_link_url });
      };
    }

    setTimeout(() => { btn.disabled = false; btn.textContent = "Send to Project"; }, 5000);
  } catch (e) {
    showToast(`❌ ${e.message}`, "error");
    btn.disabled = false;
    btn.textContent = "Send to Project";
  }
});

// ── Smart Capture ─────────────────────────────────────
document.getElementById("btn-smart-capture").addEventListener("click", () => {
  if (!state.token) {
    showToast("Connect to VantoOS first", "error");
    return;
  }

  document.getElementById("smart-capture-results").style.display = "none";
  document.getElementById("capture-deep-link").style.display = "none";
  document.getElementById("btn-send-capture").style.display = "none";
  const assistedBanner = document.getElementById("assisted-reminder-banner");
  if (assistedBanner) assistedBanner.remove();

  const btn = document.getElementById("btn-smart-capture");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Analyzing…';

  chrome.runtime.sendMessage({ type: "SMART_CAPTURE_TAB" }, async (res) => {
    if (res?.error) {
      showToast(res.error, "error");
      btn.disabled = false;
      btn.textContent = "✨ Smart Capture";
      return;
    }

    state.captureData = res.data;
    const preview = document.getElementById("capture-preview");
    preview.style.display = "block";
    document.getElementById("capture-url").textContent = res.data.url;
    document.getElementById("capture-title").textContent = res.data.title;
    document.getElementById("capture-snippet").textContent = res.data.selectedText || "(full page analyzed)";

    if (!checkCapturePermissions(res.data)) {
      btn.disabled = false;
      btn.textContent = "✨ Smart Capture";
      document.getElementById("btn-send-capture").style.display = "none";
      return;
    }

    try {
      const projectId = document.getElementById("capture-project").value;
      const result = await apiCall("smart-capture-web", {
        method: "POST",
        body: {
          url: res.data.url,
          title: res.data.title,
          snapshot: {
            selectedText: res.data.selectedText,
            metaDescription: res.data.metaDescription,
            headings: res.data.headings,
            textBlocks: res.data.textBlocks,
            tables: res.data.tables,
            formFields: res.data.formFields,
            entities: res.data.entities,
          },
          project_id: projectId || undefined,
          metadata: { source: "chrome-extension-smart" },
        },
      });

      state.smartCaptureResult = result;

      if (result.mode === "assisted" && result.assisted_remaining !== undefined) {
        showAssistedReminder(result.assisted_remaining);
      }

      if (result.redaction_toast) {
        showToast("🔒 Sensitive PII scrubbed prior to AI processing.", "info");
      }

      if (result.ai_provider_failed) {
        showToast("AI provider unreachable — basic context captured. Update keys in Settings → AI Keys to resume Smart Capture.", "error");
      }

      const resultsEl = document.getElementById("smart-capture-results");
      resultsEl.style.display = "block";
      document.getElementById("smart-summary").textContent = result.summary || "No summary available.";

      const badgeEl = document.getElementById("smart-verification-badge");
      if (result.needs_verification) {
        badgeEl.innerHTML = '<span class="badge badge-warning">⚠ Needs verification</span>';
      } else {
        badgeEl.innerHTML = '<span class="badge badge-info">✓ Grounded</span>';
      }

      if (result.suggested_project_id && !projectId) {
        const proj = state.projects.find(p => p.id === result.suggested_project_id);
        if (proj) {
          const suggestedEl = document.getElementById("smart-suggested-project");
          suggestedEl.style.display = "block";
          document.getElementById("smart-suggested-label").textContent = `💡 Suggested: ${proj.name}`;
          document.getElementById("capture-project").value = result.suggested_project_id;
        }
      }

      const actions = result.extracted_actions || [];
      if (actions.length) {
        document.getElementById("smart-actions-container").style.display = "block";
        document.getElementById("smart-actions-count").textContent = `${actions.length} task(s)`;

        const prioColor = (p) => p === "critical" ? "#dc2626" : p === "high" ? "#ef4444" : p === "medium" ? "#f59e0b" : "#6b7280";

        document.getElementById("smart-actions-list").innerHTML = actions.map((a, i) => `
          <div class="action-item">
            <input type="checkbox" id="action-${i}" checked data-index="${i}" />
            <label for="action-${i}">${escapeHtml(a.title)}</label>
            <span class="action-priority" style="color:${prioColor(a.priority)}">${a.priority || "medium"}</span>
          </div>
        `).join("");
      } else {
        document.getElementById("smart-actions-container").style.display = "none";
      }

      if (result.deep_link_url) {
        document.getElementById("capture-deep-link").style.display = "block";
        document.getElementById("btn-view-vantoos").onclick = () => {
          chrome.tabs.create({ url: result.deep_link_url });
        };
      }

      const actionText = result.action === "merged" ? "Merged" : "Captured";
      showToast(`✅ Smart ${actionText}!`);
    } catch (e) {
      if (e.message.includes("AI keys required") || e.message.includes("ai_keys_missing") || e.message.includes("data sovereignty")) {
        showToast("🔒 To guarantee data sovereignty, connect your personal OpenAI or Gemini key in Settings → AI Keys.", "error");
      } else {
        showToast(`❌ ${e.message}`, "error");
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "✨ Smart Capture";
    }
  });
});

// ── Apply Tasks ───────────────────────────────────────
document.getElementById("btn-apply-tasks").addEventListener("click", async () => {
  if (!state.smartCaptureResult?.extracted_actions?.length) return;

  const actions = state.smartCaptureResult.extracted_actions;
  const checkboxes = document.querySelectorAll('#smart-actions-list input[type="checkbox"]');
  const selectedIndices = [];
  checkboxes.forEach(cb => {
    if (cb.checked) selectedIndices.push(parseInt(cb.dataset.index));
  });

  if (!selectedIndices.length) {
    showToast("Select at least one task", "error");
    return;
  }

  const selectedActions = selectedIndices.map(i => actions[i]).filter(Boolean);
  const projectId = document.getElementById("capture-project").value ||
    state.smartCaptureResult.project_id;

  const btn = document.getElementById("btn-apply-tasks");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Applying…';

  let created = 0;
  let merged = 0;

  try {
    for (const action of selectedActions) {
      try {
        const result = await apiCall("extension-task-create", {
          method: "POST",
          body: {
            title: action.title,
            priority: action.priority || "medium",
            project_id: projectId || undefined,
            source: "smart-capture",
            source_context_id: state.smartCaptureResult.source_context_id || undefined,
            dedupe_key: `smart-${state.smartCaptureResult.source_context_id || "none"}-${action.title.toLowerCase().replace(/\s+/g, "-").slice(0, 50)}`,
          },
        });
        if (result.action === "merged") {
          merged++;
        } else {
          created++;
        }
      } catch (e) {
        console.error("Task apply error:", e);
        showToast(`❌ Failed: ${e.message}`, "error");
      }
    }

    const receipt = [];
    if (created) receipt.push(`${created} created`);
    if (merged) receipt.push(`${merged} merged`);

    const receiptEl = document.getElementById("smart-apply-receipt");
    receiptEl.style.display = "block";
    document.getElementById("smart-receipt-text").textContent = `✅ ${receipt.join(", ")}`;

    showToast(`✅ Tasks applied: ${receipt.join(", ")}`);
  } catch (e) {
    showToast(`❌ ${e.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Apply Selected Tasks";
  }
});

// ── Help Modal ────────────────────────────────────────
const HELP_GUIDES = {
  capture: "📷 <b>Capture tab</b>: Use Quick Capture for basic page info, or Smart Capture (AI) for intelligent analysis with task extraction. Select a project before capturing to file it automatically.",
  projects: "📁 <b>Projects tab</b>: View your VantoOS projects. Click a project to filter tasks by it. Projects sync from your VantoOS account.",
  tasks: "✓ <b>Tasks tab</b>: View your tasks sorted by last activity. Tasks are filtered by the selected project if any. Priority sorting shows critical items first.",
  settings: "⚙ <b>Settings tab</b>: Pair with VantoOS using a code from Settings → Chrome Extension. Manage allowed domains — grant browser permissions for each domain you want to capture from.",
};

document.getElementById("btn-help").addEventListener("click", () => {
  const modal = document.getElementById("help-modal");
  modal.classList.add("active");
  document.getElementById("help-guide-text").innerHTML = HELP_GUIDES[state.currentTab] || HELP_GUIDES.capture;
  document.getElementById("help-answer-container").style.display = "none";
  document.getElementById("help-ai-gate").style.display = "none";
});

document.getElementById("btn-close-help").addEventListener("click", () => {
  document.getElementById("help-modal").classList.remove("active");
});

document.getElementById("btn-ask-assistant").addEventListener("click", async () => {
  const question = document.getElementById("help-question-input").value.trim();
  if (!question) return;

  const btn = document.getElementById("btn-ask-assistant");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    let minimalSnapshot = null;
    if (state.captureData) {
      minimalSnapshot = {
        title: state.captureData.title,
        url: state.captureData.url,
      };
    }

    const result = await apiCall("assistant-help", {
      method: "POST",
      body: {
        current_tab: state.currentTab,
        url: state.captureData?.url || null,
        domain: state.captureData?.url ? new URL(state.captureData.url).hostname : null,
        minimal_snapshot: minimalSnapshot,
        user_question: question,
      },
    });

    const container = document.getElementById("help-answer-container");
    container.style.display = "block";
    document.getElementById("help-answer-text").textContent = result.answer;
    document.getElementById("help-ai-gate").style.display = "none";

    if (result.mode === "assisted" && result.assisted_remaining !== undefined) {
      showAssistedReminder(result.assisted_remaining);
    }

    const safetyEl = document.getElementById("help-safety-note");
    if (result.safety_note) {
      safetyEl.style.display = "block";
      safetyEl.textContent = result.safety_note;
    } else {
      safetyEl.style.display = "none";
    }
  } catch (e) {
    if (e.message.includes("AI keys required") || e.message.includes("ai_keys_missing") || e.message.includes("data sovereignty")) {
      document.getElementById("help-ai-gate").style.display = "block";
      document.getElementById("help-ai-gate").innerHTML = `
        <div style="text-align:center;padding:12px;">
          <p style="font-size:12px;color:#fca5a5;margin-bottom:8px">To guarantee data sovereignty, connect your personal OpenAI or Gemini key.</p>
          <button onclick="window.open('${APP_URL}/settings','_blank')" class="btn btn-primary btn-sm">Settings → AI Keys</button>
        </div>
      `;
      document.getElementById("help-answer-container").style.display = "none";
    } else {
      showToast(`❌ ${e.message}`, "error");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Ask";
  }
});

// ── Tabs ──────────────────────────────────────────────
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    switchToTab(tab.dataset.tab);
  });
});

// ── WhatsApp Mode ─────────────────────────────────────
let waState = {
  chatKey: null, chatTitle: null, smartResult: null, handledActions: [],
  isWhatsAppTab: false,
};

async function checkWhatsAppMode() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB" }, (res) => {
      const isWA = res?.url?.includes("web.whatsapp.com");
      waState.isWhatsAppTab = isWA;
      const webMode = document.getElementById("web-capture-mode");
      const waMode = document.getElementById("whatsapp-mode");
      if (webMode && waMode) {
        webMode.style.display = isWA ? "none" : "block";
        waMode.style.display = isWA ? "block" : "none";
      }
      if (isWA) {
        // Populate project dropdown with proper options
        updateWaProjectDropdown();
        // Fetch context from content script (single source of truth)
        fetchWaContext();
      }
      resolve(isWA);
    });
  });
}

function updateWaProjectDropdown() {
  const waSelect = document.getElementById("wa-capture-project");
  if (waSelect) {
    waSelect.innerHTML = '<option value="">No project</option>' +
      state.projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  }
}

function fetchWaContext() {
  chrome.runtime.sendMessage({ type: "GET_WHATSAPP_CONTEXT" }, (res) => {
    if (chrome.runtime.lastError) {
      console.warn("[VantoOS SP] fetchWaContext error:", chrome.runtime.lastError);
      return;
    }
    if (res?.chat_key) {
      waState.chatKey = res.chat_key;
      waState.chatTitle = res.chat_title;
      document.getElementById("wa-chat-title-display").textContent = res.chat_title || "No chat open";
      document.getElementById("wa-chat-meta").textContent = `Key: ${res.chat_key.slice(0, 16)}…`;
      // Fetch handled status with the authoritative key
      chrome.runtime.sendMessage({ type: "GET_WHATSAPP_HANDLED", chat_key: res.chat_key }, (hRes) => {
        if (hRes?.actions) updateWaHandledUI(hRes.actions);
        else updateWaHandledUI([]);
      });
    } else {
      waState.chatKey = null;
      waState.chatTitle = null;
      document.getElementById("wa-chat-title-display").textContent = "No chat detected";
      document.getElementById("wa-chat-meta").textContent = "Open a WhatsApp chat — then press 🔄";
      updateWaHandledUI([]);
    }
  });
}

// Refresh Chat Context button
document.getElementById("wa-btn-refresh-context")?.addEventListener("click", () => {
  fetchWaContext();
  showToast("Refreshing chat context…", "info");
});

function updateWaHandledUI(actions) {
  waState.handledActions = actions || [];
  const icon = document.getElementById("wa-handled-icon");
  const text = document.getElementById("wa-handled-text");
  const count = document.getElementById("wa-handled-count");
  const list = document.getElementById("wa-handled-list");

  if (!actions || actions.length === 0) {
    if (icon) icon.textContent = "⬜";
    if (text) { text.textContent = "Not handled yet"; text.style.color = "#666"; }
    if (count) count.style.display = "none";
    if (list) list.style.display = "none";
  } else {
    if (icon) icon.textContent = "✅";
    if (text) { text.textContent = "Handled"; text.style.color = "#22c55e"; }
    if (count) { count.textContent = `${actions.length} action${actions.length > 1 ? "s" : ""}`; count.style.display = ""; }
    if (list) {
      list.style.display = "block";
      const typeLabels = { task: "✓ Task", meeting: "📅 Meeting", reminder: "🔔 Reminder", notes: "📝 Notes",
        finance_income: "💰 Income", finance_expense: "💸 Expense", smart_extract: "✨ Extract" };
      list.innerHTML = actions.map(a => {
        const label = typeLabels[a.action_type] || a.action_type;
        const time = new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `<div style="display:flex;justify-content:space-between;padding:2px 0">${label}<span style="color:#555">${time}</span></div>`;
      }).join("");
    }
  }
}

async function hashForDedupe(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// WhatsApp manual action buttons — NEVER invent chat keys
["task", "meeting", "reminder", "notes"].forEach(action => {
  const btn = document.getElementById(`wa-btn-${action}-sp`);
  if (btn) {
    btn.addEventListener("click", async () => {
      // Must have authoritative chat key from content script
      if (!waState.chatKey) {
        showToast("Open a WhatsApp chat first", "error");
        return;
      }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>';

      try {
        const projectId = document.getElementById("wa-capture-project")?.value;
        const title = `[WhatsApp] ${waState.chatTitle || "Chat"}: ${action}`;
        const dedupeKey = await hashForDedupe(`${state.userId}|${waState.chatKey}|${title.toLowerCase().replace(/\s+/g, " ")}`);

        if (action === "task") {
          const result = await apiCall("extension-task-create", {
            method: "POST",
            body: { title, priority: "medium", project_id: projectId || undefined, source: "whatsapp", dedupe_key: dedupeKey },
          });
          showToast(`✅ Task ${result.action}!`);
        } else if (action === "notes") {
          await apiCall("capture-web", {
            method: "POST",
            body: {
              url: "https://web.whatsapp.com",
              title: `WhatsApp: ${waState.chatTitle || "Chat"}`,
              selected_text: `Chat notes from ${waState.chatTitle || "WhatsApp"}`,
              project_id: projectId || undefined,
              metadata: { source: "whatsapp" },
            },
          });
          showToast("✅ Sent to Notes!");
        } else if (action === "meeting") {
          const result = await apiCall("extension-task-create", {
            method: "POST",
            body: { title: `📅 Meeting: ${waState.chatTitle || "Chat"}`, priority: "high", project_id: projectId || undefined, source: "whatsapp", dedupe_key: dedupeKey },
          });
          showToast(`✅ Meeting task ${result.action}!`);
        } else if (action === "reminder") {
          const result = await apiCall("extension-task-create", {
            method: "POST",
            body: { title: `🔔 Reminder: ${waState.chatTitle || "Chat"}`, priority: "high", project_id: projectId || undefined, source: "whatsapp", dedupe_key: dedupeKey },
          });
          showToast(`✅ Reminder ${result.action}!`);
        }

        chrome.runtime.sendMessage({
          type: "LOG_WHATSAPP_ACTION",
          chat_key: waState.chatKey,
          chat_title: waState.chatTitle,
          action_type: action,
        }, (res) => {
          if (res?.actions) updateWaHandledUI(res.actions);
        });
      } catch (e) {
        showToast(`❌ ${e.message}`, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = { task: "✓ Task", meeting: "📅 Meeting", reminder: "🔔 Reminder", notes: "📝 Notes" }[action];
      }
    });
  }
});

// WhatsApp Smart Extract button — uses content script snapshot (no executeScript scraping)
document.getElementById("wa-btn-smart-extract")?.addEventListener("click", async () => {
  if (!state.token) {
    showToast("Connect to VantoOS first", "error");
    return;
  }
  if (!waState.chatKey) {
    showToast("Open a WhatsApp chat first", "error");
    return;
  }
  const btn = document.getElementById("wa-btn-smart-extract");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Extracting…';

  // Hide previous debug info
  const debugEl = document.getElementById("wa-debug-info");
  if (debugEl) debugEl.style.display = "none";

  try {
    // Step 1: Get active tab ID
    const tabInfo = await new Promise(resolve =>
      chrome.runtime.sendMessage({ type: "GET_ACTIVE_TAB" }, resolve)
    );
    const tabId = tabInfo?.tabId;
    if (!tabId) throw new Error("No active WhatsApp tab found");

    // Step 2: Request snapshot from content script (single source of truth)
    const snapshot = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: "WA_GET_CHAT_SNAPSHOT", count: 30 }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error("Content script not responding — refresh WhatsApp and try again."));
          return;
        }
        resolve(res);
      });
    });

    const messages = snapshot?.messages || [];
    const chatTitle = snapshot?.chat_title || waState.chatTitle;
    const chatKey = snapshot?.chat_key || waState.chatKey;

    // Step 3: Show debug info if 0 messages
    if (!messages.length) {
      if (debugEl) {
        debugEl.style.display = "block";
        debugEl.textContent = "Debug selectors: " + JSON.stringify(snapshot?.debug || {}, null, 1);
      }
      throw new Error("No text messages found. Scroll the chat a bit, then press 🔄 and try again.");
    }

    // Update UI with snapshot info
    document.getElementById("wa-chat-title-display").textContent = chatTitle || "WhatsApp Chat";
    document.getElementById("wa-chat-meta").textContent = `${messages.length} messages captured`;

    // Step 4: Call AI
    const result = await apiCall("smart-capture-whatsapp", {
      method: "POST",
      body: {
        chat_key: chatKey,
        chat_title: chatTitle,
        messages,
        selected_text: "",
        user_context: { locale: "ZA", currency_default: "ZAR" },
      },
    });

    waState.smartResult = result;
    renderWaSmartResults(result);

    if (result.redaction_toast) showToast("🔒 PII scrubbed before AI processing.", "info");
    if (result.mode === "assisted" && result.assisted_remaining !== undefined) showAssistedReminder(result.assisted_remaining);
  } catch (e) {
    if (e.message.includes("ai_keys") || e.message.includes("data sovereignty")) {
      showToast("🔒 Connect AI keys in Settings → AI Keys.", "error");
    } else {
      showToast(`❌ ${e.message}`, "error");
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "✨ Smart Extract Chat";
  }
});

function renderWaSmartResults(result) {
  document.getElementById("wa-smart-results").style.display = "block";
  document.getElementById("wa-smart-summary").textContent = result.summary || "No summary";

  const confChip = document.getElementById("wa-confidence-chip");
  const conf = Math.round((result.confidence || 0) * 100);
  confChip.textContent = `${conf}% conf`;
  confChip.title = `AI confidence: ${conf}%`;

  const verifyChip = document.getElementById("wa-verify-chip");
  if (result.requires_user_confirmation) {
    verifyChip.style.display = "";
    verifyChip.textContent = "⚠ Verify";
    verifyChip.title = "This analysis needs your verification before acting";
  } else {
    verifyChip.style.display = "none";
  }

  // Money direction badge
  const moneyBadge = document.getElementById("wa-money-badge");
  const md = result.money_direction;
  if (md && md.transaction_type !== "unknown" && md.ui_action !== "none" && md.confidence >= 0.75) {
    moneyBadge.style.display = "block";
    const isIncome = md.ui_action === "create_income";
    document.getElementById("wa-money-icon").textContent = isIncome ? "💰" : "💸";
    document.getElementById("wa-money-label").textContent = isIncome ? "INCOME" : "EXPENSE";
    document.getElementById("wa-money-label").style.color = isIncome ? "#22c55e" : "#ef4444";
    document.getElementById("wa-money-amount").textContent = md.amount ? `${md.currency || "ZAR"} ${md.amount}` : "";

    const finBtn = document.getElementById("wa-btn-create-finance");
    finBtn.style.display = "block";
    finBtn.textContent = isIncome ? "Create Income" : "Create Expense";
    finBtn.onclick = async () => {
      finBtn.disabled = true;
      finBtn.innerHTML = '<span class="spinner"></span>';
      try {
        const sourceMessageHash = await hashForDedupe(`${waState.chatKey}|${md.description || ""}|${md.amount || ""}`);
        const result = await apiCall("extension-finance-create", {
          method: "POST",
          body: {
            type: isIncome ? "income" : "expense",
            amount: parseFloat(md.amount) || 0,
            category: md.category || "general",
            entry_date: new Date().toISOString().split("T")[0],
            notes: `WhatsApp: ${waState.chatTitle || "Chat"} — ${md.description || ""}`,
            source_chat_key: waState.chatKey,
            source_message_hash: sourceMessageHash,
          },
        });

        chrome.runtime.sendMessage({
          type: "LOG_WHATSAPP_ACTION",
          chat_key: waState.chatKey,
          chat_title: waState.chatTitle,
          action_type: isIncome ? "finance_income" : "finance_expense",
          related_id: result.finance_entry_id,
          meta: { amount: md.amount, currency: md.currency, description: md.description },
        }, (res) => { if (res?.actions) updateWaHandledUI(res.actions); });

        const actionText = result.action === "merged" ? "Already exists" : "Created";
        showToast(`✅ ${isIncome ? "Income" : "Expense"} ${actionText}!`);
        finBtn.textContent = `✅ ${actionText}`;
      } catch (e) {
        showToast(`❌ ${e.message}`, "error");
        finBtn.textContent = isIncome ? "Create Income" : "Create Expense";
      }
      finBtn.disabled = false;
    };
  } else {
    moneyBadge.style.display = "none";
  }

  // Extracted actions with checkboxes and per-item status
  const actions = result.extracted_actions || [];
  if (actions.length) {
    document.getElementById("wa-actions-container").style.display = "block";
    document.getElementById("wa-actions-count").textContent = `${actions.length} action(s)`;
    const prioColor = (p) => p === "critical" ? "#dc2626" : p === "high" ? "#ef4444" : p === "medium" ? "#f59e0b" : "#6b7280";
    const typeIcon = (t) => t === "meeting" ? "📅" : t === "reminder" ? "🔔" : t === "notes" ? "📝" : "✓";
    document.getElementById("wa-actions-list").innerHTML = actions.map((a, i) => `
      <div class="action-item" id="wa-action-row-${i}">
        <input type="checkbox" id="wa-action-${i}" checked data-index="${i}" />
        <label for="wa-action-${i}">${typeIcon(a.action_type)} ${escapeHtml(a.title)}</label>
        <span class="action-priority" style="color:${prioColor(a.priority)}">${a.priority}</span>
        <span id="wa-action-status-${i}" style="font-size:9px;color:#555;margin-left:4px"></span>
      </div>
    `).join("");
  } else {
    document.getElementById("wa-actions-container").style.display = "none";
  }

  if (result.draft_reply) {
    document.getElementById("wa-draft-reply-container").style.display = "block";
    document.getElementById("wa-draft-reply-text").value = result.draft_reply;
  } else {
    document.getElementById("wa-draft-reply-container").style.display = "none";
  }
}

// Apply WhatsApp extracted actions with per-item status
document.getElementById("wa-btn-apply-actions")?.addEventListener("click", async () => {
  if (!waState.smartResult?.extracted_actions?.length) return;
  if (!waState.chatKey) {
    showToast("No chat key — open a WhatsApp chat first", "error");
    return;
  }

  const actions = waState.smartResult.extracted_actions;
  const checkboxes = document.querySelectorAll('#wa-actions-list input[type="checkbox"]');
  const selected = [];
  checkboxes.forEach(cb => { if (cb.checked) selected.push(parseInt(cb.dataset.index)); });
  if (!selected.length) { showToast("Select at least one action", "error"); return; }

  const btn = document.getElementById("wa-btn-apply-actions");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Applying…';

  let created = 0, merged = 0, failed = 0;
  const projectId = document.getElementById("wa-capture-project")?.value;

  // Mark all selected as queued
  for (const idx of selected) {
    const statusEl = document.getElementById(`wa-action-status-${idx}`);
    if (statusEl) { statusEl.textContent = "⏳ queued"; statusEl.style.color = "#888"; }
  }

  for (const idx of selected) {
    const a = actions[idx];
    if (!a) continue;
    const statusEl = document.getElementById(`wa-action-status-${idx}`);
    try {
      const dedupeKey = await hashForDedupe(`${state.userId}|${waState.chatKey}|${a.title.toLowerCase().replace(/\s+/g, " ")}`);
      const result = await apiCall("extension-task-create", {
        method: "POST",
        body: {
          title: a.title,
          priority: a.priority || "medium",
          project_id: projectId || undefined,
          source: "whatsapp",
          dedupe_key: dedupeKey,
        },
      });
      if (result.action === "merged") {
        merged++;
        if (statusEl) { statusEl.textContent = "🔄 merged"; statusEl.style.color = "#f59e0b"; }
      } else {
        created++;
        if (statusEl) { statusEl.textContent = "✅ created"; statusEl.style.color = "#22c55e"; }
      }

      chrome.runtime.sendMessage({
        type: "LOG_WHATSAPP_ACTION",
        chat_key: waState.chatKey,
        chat_title: waState.chatTitle,
        action_type: a.action_type || "task",
        related_id: result.task_id,
        meta: { title: a.title },
      }, (res) => { if (res?.actions) updateWaHandledUI(res.actions); });
    } catch {
      failed++;
      if (statusEl) { statusEl.textContent = "❌ failed"; statusEl.style.color = "#ef4444"; }
    }
  }

  const receipt = [];
  if (created) receipt.push(`${created} created`);
  if (merged) receipt.push(`${merged} merged`);
  if (failed) receipt.push(`${failed} failed`);

  document.getElementById("wa-apply-receipt").style.display = "block";
  document.getElementById("wa-receipt-text").textContent = `✅ ${receipt.join(", ")}`;
  showToast(`✅ Applied: ${receipt.join(", ")}`);

  btn.disabled = false;
  btn.textContent = "Apply Selected";
});

// Insert draft reply into WhatsApp composer (NEVER auto-sends)
document.getElementById("wa-btn-insert-reply")?.addEventListener("click", () => {
  const text = document.getElementById("wa-draft-reply-text")?.value;
  if (!text) return;
  chrome.runtime.sendMessage({ type: "DRAFT_WHATSAPP_REPLY", text }, (res) => {
    if (res?.ok) showToast("💬 Inserted into composer (won't auto-send)");
    else showToast("❌ Could not insert reply", "error");
  });
});

// Listen for WhatsApp messages from background/content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "WHATSAPP_SMART_RESULT" && msg.result) {
    waState.smartResult = msg.result;
    // Use chat_key from the message (originated from content script)
    if (msg.chat_key) waState.chatKey = msg.chat_key;
    if (msg.chat_title) waState.chatTitle = msg.chat_title;
    renderWaSmartResults(msg.result);
    switchToTab("capture");
  }
  if (msg?.type === "WHATSAPP_PREFILL_ACTION") {
    waState.chatKey = msg.chat_key;
    waState.chatTitle = msg.chat_title;
    switchToTab("capture");
    checkWhatsAppMode().then(() => {
      document.getElementById("wa-chat-title-display").textContent = msg.chat_title || "WhatsApp Chat";
      document.getElementById("wa-chat-meta").textContent = `Key: ${msg.chat_key?.slice(0, 16)}…`;
      const actionBtn = document.getElementById(`wa-btn-${msg.action_type}-sp`);
      if (actionBtn) setTimeout(() => actionBtn.click(), 300);
    });
  }
});

function pollWhatsAppMode() {
  if (state.currentTab === "capture") {
    checkWhatsAppMode();
  }
}

// Poll every 3 seconds for WhatsApp context updates
setInterval(pollWhatsAppMode, 3000);

// ── Init ──────────────────────────────────────────────
loadAuth();
setTimeout(checkWhatsAppMode, 1000);
