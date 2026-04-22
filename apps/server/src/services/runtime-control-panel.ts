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
      .grid { display: grid; gap: 14px; grid-template-columns: repeat(12, 1fr); }
      .panel { grid-column: span 6; border: 1px solid #243c42; background: #0b171a; border-radius: 8px; padding: 16px; }
      .wide { grid-column: span 12; }
      .third { grid-column: span 4; }
      .row { display: grid; grid-template-columns: 220px 1fr; gap: 8px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #304047; color: #d5e0df; font-size: 12px; }
      .ok { background: #0f5132; color: #c9f7df; }
      .bad { background: #6f1d1b; color: #ffd8d6; }
      .warn { background: #6b4e16; color: #ffe6ad; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .config-row { display: grid; grid-template-columns: minmax(210px, 260px) 1fr 180px; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
      .config-meta { color: #9fb4b8; font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
      small { color: #9fb4b8; }
      pre { overflow: auto; max-height: 320px; background: #050b0d; padding: 12px; border-radius: 6px; border: 1px solid #21353a; }
      #message { margin: 12px 0; min-height: 24px; color: #b9f3d0; }
      dialog { border: 1px solid #31565d; border-radius: 8px; background: #0b171a; color: #edf7f3; width: min(560px, calc(100vw - 32px)); }
      dialog::backdrop { background: rgba(0, 0, 0, .62); }
      .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
      .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #31565d; border-top-color: #b9f3d0; border-radius: 50%; animation: spin .8s linear infinite; vertical-align: -3px; margin-right: 8px; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (max-width: 900px) { .panel, .third { grid-column: span 12; } .row, .config-row { grid-template-columns: 1fr; } header { display: block; } }
    </style>
  </head>
  <body>
    <header>
      <div>
        <small>TICHUML OPERATIONS</small>
        <h1>Runtime Control</h1>
      </div>
      <div>
        <input id="confirm" placeholder="confirmation token" value="CLEAR_TICHU_DB" />
        <button id="refresh">Refresh status</button>
      </div>
    </header>
    <div id="message"></div>
    <main class="grid">
      <section class="panel third"><h2>Backend</h2><div id="backend"></div></section>
      <section class="panel third"><h2>Postgres</h2><div id="postgres"></div></section>
      <section class="panel third"><h2>Runtime</h2><div id="runtime"></div></section>
      <section class="panel"><h2>Endpoints</h2><div id="endpoints"></div></section>
      <section class="panel"><h2>Tools</h2><div id="tools"></div></section>
      <section class="panel"><h2>Git / Repo</h2><div id="git"></div></section>
      <section class="panel"><h2>Actions</h2><div class="actions" id="actions"></div></section>
      <section class="panel wide"><h2>Config</h2><div id="config"></div><button id="saveConfig">Save Config</button></section>
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
        { id: "update-repo", label: "Update Repo", expect: "healthy", modal: true },
        { id: "clear-db", label: "Clear DB", expect: "postgres", modal: true, danger: true, confirm: true },
        { id: "apply-config-restart", label: "Apply config + restart", expect: "healthy", modal: true }
      ];
      const $ = (id) => document.getElementById(id);
      const html = (value) => String(value ?? "n/a").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
      const badge = (ok) => '<span class="badge ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'warn') + '">' + (ok === true ? 'OK' : ok === false ? 'FAIL' : 'UNKNOWN') + '</span>';
      const row = (k, v) => '<div class="row"><strong>' + html(k) + '</strong><span>' + (v ?? 'n/a') + '</span></div>';
      let latestStatus = null;
      let configEntries = [];
      let busy = false;

      function setMessage(text, isError = false) {
        $('message').style.color = isError ? '#ffd8d6' : '#b9f3d0';
        $('message').textContent = text;
      }

      async function api(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (options.method && options.method !== 'GET') headers['x-admin-confirm'] = $('confirm').value;
        if (options.body) headers['content-type'] = 'application/json';
        const res = await fetch(path, { ...options, headers });
        const text = await res.text();
        const payload = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error(payload?.error || payload?.message || ('HTTP ' + res.status));
        return payload;
      }

      function renderStatus(status) {
        latestStatus = status;
        $('backend').innerHTML = row('Running', badge(status.backend.running)) + row('Health', badge(status.endpoints.health?.ok)) + row('PID', html(status.backend.pid)) + row('Uptime', status.backend.uptime_seconds ? html(status.backend.uptime_seconds + 's') : 'n/a') + row('Port listeners', html(status.backend.port_listeners.join(', ') || 'none'));
        $('postgres').innerHTML = row('Container', badge(status.postgres.container_running)) + row('Ready', badge(status.postgres.ready)) + row('Detail', html(status.postgres.detail));
        $('runtime').innerHTML = row('Public URL', html(status.runtime.backend_public_url)) + row('Local URL', html(status.runtime.backend_local_url)) + row('Detected IP', html(status.runtime.detected_primary_ip || 'none')) + row('IP override', html(status.runtime.backend_host_ip_override || 'none')) + row('Pending restart', badge(!status.runtime.config_pending_restart)) + row('Venv', badge(status.runtime.python_venv_exists)) + row('Node deps', badge(status.runtime.node_modules_exists)) + row('LightGBM model', badge(status.runtime.lightgbm_model_exists));
        $('endpoints').innerHTML = Object.entries(status.endpoints).map(([k,v]) => row(k, badge(v.ok) + ' ' + html(v.label) + ' ' + html(v.detail))).join('');
        $('tools').innerHTML = Object.entries(status.tools).map(([k,v]) => row(k, badge(v.ok) + ' ' + html(v.label))).join('');
        $('git').innerHTML = row('Branch', html(status.git.branch)) + row('Local commit', html(status.git.local_commit)) + row('Remote commit', html(status.git.remote_commit)) + row('Ahead / behind', html(status.git.ahead + ' / ' + status.git.behind)) + row('Dirty state', badge(status.git.dirty === false) + ' ' + (status.git.dirty ? 'dirty' : 'clean'));
        $('backendLog').textContent = status.recent_logs.backend.join('\\n') || 'No backend log lines.';
        $('actionLog').textContent = status.recent_logs.actions.join('\\n') || 'No action log lines.';
      }

      function renderConfig(config) {
        configEntries = config.entries;
        $('config').innerHTML = config.entries.map((entry) => {
          const meta = [
            entry.restart_required ? 'restart required' : 'dynamic',
            entry.detected_value ? 'detected: ' + entry.detected_value : null,
            entry.overridden ? 'override active' : 'using effective: ' + entry.effective_value
          ].filter(Boolean).map(html).join('<br>');
          const booleanValue = String(entry.value).toLowerCase() === 'true' ? 'true' : 'false';
          const control = entry.input === 'boolean'
            ? '<select data-key="' + html(entry.key) + '"><option value="true"' + (booleanValue === 'true' ? ' selected' : '') + '>true</option><option value="false"' + (booleanValue === 'false' ? ' selected' : '') + '>false</option></select>'
            : '<input data-key="' + html(entry.key) + '" value="' + html(entry.value) + '" placeholder="' + html(entry.effective_value) + '">';
          return '<div class="config-row"><div><strong>' + html(entry.key) + '</strong><br><small>' + html(entry.description) + '</small></div>' + control + '<div class="config-meta">' + meta + '</div></div>';
        }).join('');
      }

      async function refresh(silent = false) {
        try {
          const [status, config] = await Promise.all([api('/api/admin/runtime/status'), api('/api/admin/runtime/config')]);
          renderStatus(status);
          renderConfig(config);
          if (!silent) setMessage('Refreshed ' + new Date().toLocaleTimeString());
          return status;
        } catch (error) {
          if (!silent) setMessage(error.message, true);
          throw error;
        }
      }

      function setBusy(value) {
        busy = value;
        document.querySelectorAll('button').forEach((button) => {
          if (button.id !== 'modalNo') button.disabled = value;
        });
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
        if (expect === 'stopped') return status.backend.running === false && status.endpoints.health?.ok === false;
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
          const confirmed = await showConfirm(action.label, 'Are you sure? This operation is destructive.');
          if (!confirmed) return;
        }
        setBusy(true);
        showProgress(action.label, 'Requesting ' + action.label + '...');
        try {
          const result = await api('/api/admin/runtime/actions/' + action.id, { method: 'POST', body: JSON.stringify({}) });
          setMessage(result.message);
          $('modalBody').innerHTML = '<span class="spinner"></span>' + html(result.message);
          await pollUntil(action.expect, action.id === 'update-repo' || action.id === 'full-restart' ? 240 : 120);
          $('modal').close();
          setMessage(action.label + ' completed.');
          await refresh(true);
          if (action.modal && action.expect === 'healthy') {
            location.reload();
          }
        } catch (error) {
          $('modalBody').textContent = error.message;
          $('modalActions').innerHTML = '<button id="modalClose">Close</button>';
          $('modalClose').onclick = () => $('modal').close();
          setMessage(error.message, true);
        } finally {
          setBusy(false);
        }
      }

      $('actions').innerHTML = actions.map((action) => '<button data-action="' + action.id + '"' + (action.danger ? ' class="danger"' : '') + '>' + html(action.label) + '</button>').join('');
      $('actions').addEventListener('click', (event) => {
        const id = event.target.dataset.action;
        const action = actions.find((candidate) => candidate.id === id);
        if (action) void runAction(action);
      });
      $('saveConfig').addEventListener('click', async () => {
        const values = {};
        document.querySelectorAll('[data-key]').forEach((input) => { values[input.dataset.key] = input.value; });
        try {
          setBusy(true);
          const result = await api('/api/admin/runtime/config', { method: 'POST', body: JSON.stringify({ values }) });
          renderConfig(result.config);
          setMessage(result.message + (result.restart_required ? ' Use Apply config + restart.' : ''));
        } catch (error) {
          setMessage(error.message, true);
        } finally {
          setBusy(false);
        }
      });
      $('refresh').addEventListener('click', () => void refresh());
      refresh();
      setInterval(() => { if (!busy) void refresh(true); }, 10000);
    </script>
  </body>
</html>`;
}
