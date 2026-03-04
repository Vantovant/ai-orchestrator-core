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
    if (res.status === 402) {
      throw new Error(data.message || "AI keys required");
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
  // Reset smart capture results
  document.getElementById("smart-capture-results").style.display = "none";
  document.getElementById("capture-deep-link").style.display = "none";

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

  // Reset previous results
  document.getElementById("smart-capture-results").style.display = "none";
  document.getElementById("capture-deep-link").style.display = "none";
  document.getElementById("btn-send-capture").style.display = "none";

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

    // Check domain permissions first
    if (!checkCapturePermissions(res.data)) {
      btn.disabled = false;
      btn.textContent = "✨ Smart Capture";
      document.getElementById("btn-send-capture").style.display = "none";
      return;
    }

    // Call smart-capture-web
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

      // Show redaction toast
      if (result.redaction_toast) {
        showToast("🔒 Sensitive PII scrubbed prior to AI processing.", "info");
      }

      // Show summary
      const resultsEl = document.getElementById("smart-capture-results");
      resultsEl.style.display = "block";
      document.getElementById("smart-summary").textContent = result.summary || "No summary available.";

      // Verification badge
      const badgeEl = document.getElementById("smart-verification-badge");
      if (result.needs_verification) {
        badgeEl.innerHTML = '<span class="badge badge-warning">⚠ Needs verification</span>';
      } else {
        badgeEl.innerHTML = '<span class="badge badge-info">✓ Grounded</span>';
      }

      // Suggested project
      if (result.suggested_project_id && !projectId) {
        const proj = state.projects.find(p => p.id === result.suggested_project_id);
        if (proj) {
          const suggestedEl = document.getElementById("smart-suggested-project");
          suggestedEl.style.display = "block";
          document.getElementById("smart-suggested-label").textContent = `💡 Suggested: ${proj.name}`;
          document.getElementById("capture-project").value = result.suggested_project_id;
        }
      }

      // Extracted actions
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

      // Deep link
      if (result.deep_link_url) {
        document.getElementById("capture-deep-link").style.display = "block";
        document.getElementById("btn-view-vantoos").onclick = () => {
          chrome.tabs.create({ url: result.deep_link_url });
        };
      }

      const actionText = result.action === "merged" ? "Merged" : "Captured";
      showToast(`✅ Smart ${actionText}!`);
    } catch (e) {
      if (e.message.includes("AI keys required") || e.message.includes("ai_keys_missing")) {
        showToast("🔒 Connect AI in VantoOS → Settings → AI Keys", "error");
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
    // Collect minimal context
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

    const safetyEl = document.getElementById("help-safety-note");
    if (result.safety_note) {
      safetyEl.style.display = "block";
      safetyEl.textContent = result.safety_note;
    } else {
      safetyEl.style.display = "none";
    }
  } catch (e) {
    if (e.message.includes("AI keys required") || e.message.includes("ai_keys_missing")) {
      document.getElementById("help-ai-gate").style.display = "block";
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

// ── Init ──────────────────────────────────────────────
loadAuth();
