export type RuntimeGitStatusInput = {
  dirty: boolean | null;
  ahead: number | null;
  behind: number | null;
};

export type RuntimeGitStatusView = {
  state: "current" | "dirty" | "diverged" | "unknown";
  label: string;
  tone: "ok" | "warn";
};

export function classifyRuntimeGitStatus(
  git: RuntimeGitStatusInput
): RuntimeGitStatusView {
  if (git.dirty === null || git.ahead === null || git.behind === null) {
    return { state: "unknown", label: "UNKNOWN", tone: "warn" };
  }
  if (git.dirty) {
    return { state: "dirty", label: "DIRTY", tone: "warn" };
  }
  if (git.ahead > 0 || git.behind > 0) {
    return {
      state: "diverged",
      label: `ahead ${git.ahead} / behind ${git.behind}`,
      tone: "warn"
    };
  }
  return { state: "current", label: "CLEAN / CURRENT", tone: "ok" };
}

export function formatRuntimeYesNo(value: boolean): "Yes" | "No" {
  return value ? "Yes" : "No";
}

export function renderRuntimeControlPanel(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TichuML Runtime Control</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #071012; color: #edf7f3; }
      body { margin: 0; padding: 24px; background: #071012; }
      header { display: flex; justify-content: space-between; gap: 16px; align-items: start; margin-bottom: 20px; }
      h1 { margin: 0; font-size: 30px; }
      h2 { margin: 0 0 12px; font-size: 18px; }
      button, input, select { font: inherit; }
      button { background: #123237; color: #edf7f3; border: 1px solid #31565d; padding: 9px 12px; border-radius: 6px; cursor: pointer; min-height: 38px; }
      button:hover:not(:disabled) { background: #194249; }
      button:disabled { opacity: .55; cursor: wait; }
      button.danger { background: #5a1616; border-color: #8b3030; }
      button.danger:hover:not(:disabled) { background: #742020; }
      input, select { width: 100%; box-sizing: border-box; background: #0c1a1d; color: #edf7f3; border: 1px solid #29474d; border-radius: 5px; padding: 8px; min-height: 38px; }
      input:disabled { opacity: .62; }
      .grid { display: grid; gap: 14px; grid-template-columns: repeat(12, 1fr); }
      .panel { grid-column: span 6; border: 1px solid #243c42; background: #0b171a; border-radius: 8px; padding: 16px; }
      .wide { grid-column: span 12; }
      .third { grid-column: span 4; }
      .row { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 8px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,.06); min-width: 0; }
      .row span { min-width: 0; overflow-wrap: anywhere; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #304047; color: #d5e0df; font-size: 12px; max-width: 100%; overflow-wrap: anywhere; }
      .ok { background: #0f5132; color: #c9f7df; }
      .bad { background: #6f1d1b; color: #ffd8d6; }
      .warn { background: #6b4e16; color: #ffe6ad; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .config-row { display: grid; grid-template-columns: minmax(190px, 250px) 120px minmax(240px, 1fr) minmax(190px, 240px); gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.06); min-width: 0; }
      .config-meta { color: #9fb4b8; font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
      .category { margin: 18px 0 6px; color: #d5e0df; font-weight: 700; }
      small { color: #9fb4b8; }
      pre { overflow: auto; max-height: 320px; background: #050b0d; padding: 12px; border-radius: 6px; border: 1px solid #21353a; white-space: pre-wrap; overflow-wrap: anywhere; }
      #message { margin: 12px 0; min-height: 24px; color: #b9f3d0; }
      dialog { border: 1px solid #31565d; border-radius: 8px; background: #0b171a; color: #edf7f3; width: min(600px, calc(100vw - 32px)); }
      dialog::backdrop { background: rgba(0, 0, 0, .62); }
      .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
      .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #31565d; border-top-color: #b9f3d0; border-radius: 50%; animation: spin .8s linear infinite; vertical-align: -3px; margin-right: 8px; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (max-width: 1050px) { .panel, .third { grid-column: span 12; } .row, .config-row { grid-template-columns: 1fr; } header { display: block; } }
    </style>
  </head>
  <body>
    <header>
      <div>
        <small>TICHUML OPERATIONS</small>
        <h1>Runtime Control</h1>
      </div>
      <button id="refresh">Refresh status</button>
    </header>
    <div id="message"></div>
    <main class="grid">
      <section class="panel third"><h2>Backend</h2><div id="backend"></div></section>
      <section class="panel third"><h2>Postgres</h2><div id="postgres"></div></section>
      <section class="panel third"><h2>Runtime</h2><div id="runtime"></div></section>
      <section class="panel"><h2>Admin Safety</h2><div id="safety"></div><div class="actions" id="safetyActions"></div></section>
      <section class="panel"><h2>Git / Repo</h2><div id="git"></div><div class="actions"><button data-action="update-repo">Update Repo</button></div></section>
      <section class="panel"><h2>Actions</h2><div class="actions" id="actions"></div></section>
      <section class="panel"><h2>Endpoints</h2><div id="endpoints"></div></section>
      <section class="panel"><h2>Tools</h2><div id="tools"></div></section>
      <section class="panel wide"><h2>Config</h2><div id="config"></div><div class="actions"><button id="saveConfig">Save Config</button><button id="resetConfig">Reset form</button></div></section>
      <section class="panel"><h2>Backend Log</h2><pre id="backendLog"></pre></section>
      <section class="panel"><h2>Action Log</h2><pre id="actionLog"></pre></section>
    </main>
    <dialog id="modal">
      <h2 id="modalTitle">Working</h2>
      <p id="modalBody"></p>
      <pre id="modalLog"></pre>
      <div class="modal-actions" id="modalActions"></div>
    </dialog>
    <script>
      const actions = [
        { id: "start-backend", label: "Start", expect: "healthy" },
        { id: "stop-backend", label: "Stop", expect: "stopped", modal: true },
        { id: "restart-backend", label: "Restart", expect: "healthy", modal: true },
        { id: "full-restart", label: "Full restart", expect: "healthy", modal: true },
        { id: "start-postgres", label: "Postgres start", expect: "postgres" },
        { id: "stop-postgres", label: "Postgres stop", expect: "postgres-stopped" },
        { id: "clear-db", label: "Clear DB", expect: "postgres", modal: true, danger: true, confirm: "Are you sure? This resets the database and reruns migrations." },
        { id: "apply-config-restart", label: "Apply config + restart", expect: "healthy", modal: true }
      ];
      const $ = (id) => document.getElementById(id);
      const html = (value) => String(value ?? "n/a").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
      const badge = (ok) => '<span class="badge ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'warn') + '">' + (ok === true ? 'OK' : ok === false ? 'FAIL' : 'UNKNOWN') + '</span>';
      const yesNo = (value) => value ? 'Yes' : 'No';
      const row = (k, v) => '<div class="row"><strong>' + html(k) + '</strong><span>' + (v ?? 'n/a') + '</span></div>';
      let latestStatus = null;
      let savedConfig = null;
      let formState = {};
      let dirtyKeys = new Set();
      let busy = false;

      function setMessage(text, isError = false) {
        $('message').style.color = isError ? '#ffd8d6' : '#b9f3d0';
        $('message').textContent = text;
      }

      async function api(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (options.body) headers['content-type'] = 'application/json';
        const res = await fetch(path, { ...options, headers });
        const text = await res.text();
        const payload = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error(payload?.error || payload?.message || ('HTTP ' + res.status));
        return payload;
      }

      function initializeForm(config, force = false) {
        savedConfig = config;
        if (force || Object.keys(formState).length === 0 || dirtyKeys.size === 0) {
          formState = {};
          for (const entry of config.entries) {
            formState[entry.key] = {
              savedValue: entry.savedValue,
              overrideEnabled: entry.overrideEnabled,
              overrideValue: entry.overrideValue
            };
          }
          dirtyKeys.clear();
        }
      }

      function gitState(status) {
        if (status.git.dirty === null || status.git.ahead === null || status.git.behind === null) {
          return '<span class="badge warn">UNKNOWN</span>';
        }
        if (status.git.dirty) {
          return '<span class="badge warn">DIRTY</span>';
        }
        if (status.git.ahead > 0 || status.git.behind > 0) {
          return '<span class="badge warn">' + html('ahead ' + status.git.ahead + ' / behind ' + status.git.behind) + '</span>';
        }
        return '<span class="badge ok">CLEAN / CURRENT</span>';
      }

      function renderStatus(status) {
        latestStatus = status;
        $('backend').innerHTML = row('Running', badge(status.backend.running)) + row('Health', badge(status.endpoints.health?.ok)) + row('PID', html(status.backend.pid)) + row('Uptime', status.backend.uptime_seconds ? html(status.backend.uptime_seconds + 's') : 'n/a') + row('Port listeners', html(status.backend.port_listeners.join(', ') || 'none'));
        $('postgres').innerHTML = row('Container', badge(status.postgres.container_running)) + row('Ready', badge(status.postgres.ready)) + row('Detail', html(status.postgres.detail));
        $('runtime').innerHTML = row('Public URL', html(status.runtime.backend_public_url)) + row('Local URL', html(status.runtime.backend_local_url)) + row('Ethernet IP', html(status.runtime.detected_ethernet || 'none')) + row('Wireless IP', html(status.runtime.detected_wireless || 'none')) + row('Default IP', html(status.runtime.detected_default)) + row('IP override', html(status.runtime.backend_host_ip_override || 'none')) + row('Pending restart', html(yesNo(status.runtime.config_pending_restart))) + row('Venv', badge(status.runtime.python_venv_exists)) + row('Node deps', badge(status.runtime.node_modules_exists)) + row('LightGBM model', badge(status.runtime.lightgbm_model_exists));
        $('safety').innerHTML = row('State', status.admin_safety.locked ? '<span class="badge warn">LOCKED</span>' : '<span class="badge ok">UNLOCKED</span>') + row('Blocked actions', html(status.admin_safety.blocked_actions.join(', ') || 'none'));
        $('safetyActions').innerHTML = status.admin_safety.locked ? '<button id="unlockSafety">Disable lock</button>' : '<button id="lockSafety">Enable lock</button>';
        $('git').innerHTML = row('State', gitState(status)) + row('Branch', html(status.git.branch)) + row('Local commit', html(status.git.local_commit)) + row('Remote commit', html(status.git.remote_commit)) + row('Ahead / behind', html(status.git.ahead + ' / ' + status.git.behind)) + row('Dirty state', html(status.git.dirty === null ? 'unknown' : status.git.dirty ? 'dirty' : 'clean'));
        $('endpoints').innerHTML = Object.entries(status.endpoints).map(([k,v]) => row(k, badge(v.ok) + ' ' + html(v.label) + ' ' + html(v.detail))).join('');
        $('tools').innerHTML = Object.entries(status.tools).map(([k,v]) => row(k, badge(v.ok) + ' ' + html(v.label))).join('');
        $('backendLog').textContent = status.recent_logs.backend.join('\\n') || 'No backend log lines.';
        $('actionLog').textContent = status.recent_logs.actions.join('\\n') || 'No action log lines.';
      }

      function controlFor(entry, state) {
        const value = state.overrideEnabled === false ? entry.detectedValue || '' : state.savedValue;
        if (entry.type === 'boolean') {
          const boolValue = String(state.savedValue).toLowerCase() === 'true' ? 'true' : 'false';
          return '<select data-key="' + html(entry.key) + '" data-field="savedValue"><option value="true"' + (boolValue === 'true' ? ' selected' : '') + '>true</option><option value="false"' + (boolValue === 'false' ? ' selected' : '') + '>false</option></select>';
        }
        if (entry.input === 'select' && Array.isArray(entry.options)) {
          return '<select data-key="' + html(entry.key) + '" data-field="savedValue">' + entry.options.map((option) => '<option value="' + html(option) + '"' + (String(state.savedValue) === String(option) ? ' selected' : '') + '>' + html(option) + '</option>').join('') + '</select>';
        }
        return '<input data-key="' + html(entry.key) + '" data-field="savedValue" type="' + (entry.type === 'number' ? 'number' : 'text') + '" value="' + html(value) + '"' + (state.overrideEnabled === false ? ' disabled' : '') + '>';
      }

      function renderConfig(config) {
        initializeForm(config);
        let currentCategory = '';
        $('config').innerHTML = config.entries.map((entry) => {
          const state = formState[entry.key] || { savedValue: entry.savedValue, overrideEnabled: entry.overrideEnabled, overrideValue: entry.overrideValue };
          const parts = [];
          if (entry.category !== currentCategory) {
            currentCategory = entry.category;
            parts.push('<div class="category">' + html(currentCategory) + '</div>');
          }
          const meta = [
            entry.requiresRestart ? 'restart required' : 'dynamic',
            entry.detectedValue ? 'detected: ' + entry.detectedValue : null,
            'effective: ' + (state.overrideEnabled === false ? entry.detectedValue : state.savedValue || entry.effectiveValue),
            dirtyKeys.has(entry.key) ? 'unsaved edit' : null
          ].filter(Boolean).map(html).join('<br>');
          const override = entry.detectedValue
            ? '<select data-key="' + html(entry.key) + '" data-field="overrideEnabled"><option value="false"' + (state.overrideEnabled === false ? ' selected' : '') + '>Override: No</option><option value="true"' + (state.overrideEnabled === true ? ' selected' : '') + '>Override: Yes</option></select>'
            : '<span class="config-meta">manual</span>';
          parts.push('<div class="config-row"><div><strong>' + html(entry.label) + '</strong><br><small>' + html(entry.description) + '</small><br><small>' + html(entry.key) + '</small></div>' + override + controlFor(entry, state) + '<div class="config-meta">' + meta + '</div></div>');
          return parts.join('');
        }).join('');
      }

      async function refresh(silent = false) {
        try {
          const [status, config] = await Promise.all([api('/api/admin/runtime/status'), api('/api/admin/runtime/config')]);
          renderStatus(status);
          initializeForm(config, false);
          if (dirtyKeys.size === 0) renderConfig(config);
          else savedConfig = config;
          if (!silent) setMessage('Refreshed ' + new Date().toLocaleTimeString());
          return status;
        } catch (error) {
          if (!silent) setMessage(error.message, true);
          throw error;
        }
      }

      function setBusy(value) {
        busy = value;
        document.querySelectorAll('button').forEach((button) => { if (!button.id.startsWith('modal')) button.disabled = value; });
      }

      function showProgress(title, body) {
        $('modalTitle').textContent = title;
        $('modalBody').innerHTML = '<span class="spinner"></span>' + html(body);
        $('modalLog').textContent = '';
        $('modalActions').innerHTML = '';
        $('modal').showModal();
      }

      function showConfirm(title, body) {
        return new Promise((resolve) => {
          $('modalTitle').textContent = title;
          $('modalBody').textContent = body;
          $('modalLog').textContent = '';
          $('modalActions').innerHTML = '<button id="modalNo">No</button><button id="modalYes" class="danger">Yes</button>';
          $('modalNo').onclick = () => { $('modal').close(); resolve(false); };
          $('modalYes').onclick = () => { $('modal').close(); resolve(true); };
          $('modal').showModal();
        });
      }

      function conditionMet(expect, status) {
        if (expect === 'healthy') return status.endpoints.health?.ok === true;
        if (expect === 'stopped') return status.backend.running === false || status.endpoints.health?.ok === false;
        if (expect === 'postgres') return status.postgres.ready === true;
        if (expect === 'postgres-stopped') return status.postgres.container_running === false || status.postgres.ready === false;
        return true;
      }

      async function pollUntil(expect, seconds) {
        const deadline = Date.now() + seconds * 1000;
        let lastError = null;
        while (Date.now() < deadline) {
          try {
            const status = await refresh(true);
            $('modalLog').textContent = status.recent_logs.actions.join('\\n') || 'Waiting for runtime action output...';
            if (conditionMet(expect, status)) return status;
          } catch (error) {
            if (expect === 'stopped') return latestStatus;
            lastError = error;
          }
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        throw lastError || new Error('Timed out waiting for runtime state: ' + expect);
      }

      async function runAction(action) {
        if (busy) return;
        if (action.confirm) {
          const confirmed = await showConfirm(action.label, action.confirm);
          if (!confirmed) return;
        }
        setBusy(true);
        showProgress(action.label, 'Requesting ' + action.label + '...');
        try {
          const result = await api('/api/admin/runtime/actions/' + action.id, { method: 'POST', body: JSON.stringify({ confirmed: Boolean(action.confirm) }) });
          setMessage(result.message);
          $('modalBody').innerHTML = '<span class="spinner"></span>' + html(result.message);
          await pollUntil(action.expect, action.id === 'update-repo' || action.id === 'full-restart' ? 240 : 120);
          $('modal').close();
          setMessage(action.label + ' completed.');
          await refresh(true);
          if (action.modal && action.expect === 'healthy') location.reload();
        } catch (error) {
          $('modalBody').textContent = error.message;
          $('modalActions').innerHTML = '<button id="modalClose">Close</button>';
          $('modalClose').onclick = () => $('modal').close();
          setMessage(error.message, true);
        } finally {
          setBusy(false);
        }
      }

      async function setSafetyLock(locked) {
        if (!locked) {
          const confirmed = await showConfirm('Disable lock', 'Disable the admin safety lock? Runtime action buttons will work after the backend restarts with the saved setting.');
          if (!confirmed) return;
        }
        try {
          const result = await api('/api/admin/runtime/safety', { method: 'POST', body: JSON.stringify({ locked, confirmed: !locked }) });
          initializeForm(result.config, true);
          renderConfig(result.config);
          setMessage(result.message);
          await refresh(true);
        } catch (error) {
          setMessage(error.message, true);
        }
      }

      $('actions').innerHTML = actions.map((action) => '<button data-action="' + action.id + '"' + (action.danger ? ' class="danger"' : '') + '>' + html(action.label) + '</button>').join('');
      document.body.addEventListener('click', (event) => {
        const id = event.target.dataset?.action;
        const action = [...actions, { id: 'update-repo', label: 'Update Repo', expect: 'healthy', modal: true }].find((candidate) => candidate.id === id);
        if (action) void runAction(action);
        if (event.target.id === 'unlockSafety') void setSafetyLock(false);
        if (event.target.id === 'lockSafety') void setSafetyLock(true);
      });
      $('config').addEventListener('input', (event) => {
        const key = event.target.dataset?.key;
        const field = event.target.dataset?.field;
        if (!key || !field) return;
        formState[key] = formState[key] || {};
        formState[key][field] = field === 'overrideEnabled' ? event.target.value === 'true' : event.target.value;
        if (field === 'savedValue') formState[key].overrideValue = event.target.value;
        dirtyKeys.add(key);
        if (field !== 'savedValue') renderConfig(savedConfig);
      });
      $('config').addEventListener('change', (event) => {
        if (event.target.dataset?.field === 'overrideEnabled') {
          const key = event.target.dataset.key;
          formState[key].overrideEnabled = event.target.value === 'true';
          dirtyKeys.add(key);
          renderConfig(savedConfig);
        }
      });
      $('saveConfig').addEventListener('click', async () => {
        const values = {};
        for (const entry of savedConfig.entries) {
          const state = formState[entry.key];
          values[entry.key] = {
            savedValue: state.savedValue,
            overrideValue: state.overrideValue || state.savedValue || '',
            overrideEnabled: state.overrideEnabled === true
          };
        }
        try {
          setBusy(true);
          const result = await api('/api/admin/runtime/config', { method: 'POST', body: JSON.stringify({ values }) });
          initializeForm(result.config, true);
          renderConfig(result.config);
          setMessage(result.message + (result.restart_required ? ' Use Apply config + restart.' : ''));
        } catch (error) {
          setMessage(error.message, true);
        } finally {
          setBusy(false);
        }
      });
      $('resetConfig').addEventListener('click', () => { if (savedConfig) { initializeForm(savedConfig, true); renderConfig(savedConfig); setMessage('Form reset to saved config.'); } });
      $('refresh').addEventListener('click', () => void refresh());
      refresh();
      setInterval(() => { if (!busy) void refresh(true); }, 10000);
    </script>
  </body>
</html>`;
}
