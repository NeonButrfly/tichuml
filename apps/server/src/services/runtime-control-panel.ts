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
      button, input { font: inherit; }
      button { background: #123237; color: #edf7f3; border: 1px solid #31565d; padding: 9px 12px; border-radius: 6px; cursor: pointer; }
      button:hover { background: #194249; }
      input { width: 100%; box-sizing: border-box; background: #0c1a1d; color: #edf7f3; border: 1px solid #29474d; border-radius: 5px; padding: 8px; }
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
      .config-row { display: grid; grid-template-columns: 260px 1fr 130px; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
      small { color: #9fb4b8; }
      pre { overflow: auto; max-height: 320px; background: #050b0d; padding: 12px; border-radius: 6px; border: 1px solid #21353a; }
      #message { margin: 12px 0; min-height: 24px; color: #b9f3d0; }
      @media (max-width: 900px) { .panel, .third { grid-column: span 12; } .row, .config-row { grid-template-columns: 1fr; } }
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
        <button id="refresh">Refresh</button>
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
    <script>
      const actions = [
        ["start_backend", "Start backend"], ["stop_backend", "Stop backend"],
        ["restart_backend", "Restart backend"], ["start_postgres", "Start postgres"],
        ["stop_postgres", "Stop postgres"], ["full_restart", "Full restart"],
        ["apply_config_restart", "Apply config + restart"]
      ];
      const $ = (id) => document.getElementById(id);
      const badge = (ok) => '<span class="badge ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'warn') + '">' + (ok === true ? 'OK' : ok === false ? 'FAIL' : 'UNKNOWN') + '</span>';
      const row = (k, v) => '<div class="row"><strong>' + k + '</strong><span>' + (v ?? 'n/a') + '</span></div>';
      let configEntries = [];
      function setMessage(text) { $('message').textContent = text; }
      async function api(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (options.method && options.method !== 'GET') headers['x-admin-confirm'] = $('confirm').value;
        if (options.body) headers['content-type'] = 'application/json';
        const res = await fetch(path, { ...options, headers });
        const text = await res.text();
        const payload = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error(payload?.error || ('HTTP ' + res.status));
        return payload;
      }
      function renderStatus(status) {
        $('backend').innerHTML = row('Running', badge(status.backend.running)) + row('PID', status.backend.pid) + row('Uptime', status.backend.uptime_seconds ? status.backend.uptime_seconds + 's' : 'n/a') + row('Port listeners', status.backend.port_listeners.join(', ') || 'none');
        $('postgres').innerHTML = row('Container', badge(status.postgres.container_running)) + row('Ready', badge(status.postgres.ready)) + row('Detail', status.postgres.detail);
        $('runtime').innerHTML = row('Public URL', status.runtime.backend_public_url) + row('Local URL', status.runtime.backend_local_url) + row('Pending restart', badge(!status.runtime.config_pending_restart)) + row('Web bundle', badge(status.runtime.web_dist_exists)) + row('LightGBM model', badge(status.runtime.lightgbm_model_exists));
        $('endpoints').innerHTML = Object.entries(status.endpoints).map(([k,v]) => row(k, badge(v.ok) + ' ' + v.label + ' ' + v.detail)).join('');
        $('tools').innerHTML = Object.entries(status.tools).map(([k,v]) => row(k, badge(v.ok) + ' ' + v.label)).join('');
        $('git').innerHTML = row('Branch', status.git.branch) + row('Local', status.git.local_commit) + row('Remote', status.git.remote_commit) + row('Ahead/behind', status.git.ahead + '/' + status.git.behind) + row('Dirty', badge(status.git.dirty === false));
        $('backendLog').textContent = status.recent_logs.backend.join('\\n') || 'No backend log lines.';
        $('actionLog').textContent = status.recent_logs.actions.join('\\n') || 'No action log lines.';
      }
      function renderConfig(config) {
        configEntries = config.entries;
        $('config').innerHTML = config.entries.map((entry) =>
          '<div class="config-row"><div><strong>' + entry.key + '</strong><br><small>' + entry.description + '</small></div><input data-key="' + entry.key + '" value="' + String(entry.value).replaceAll('&','&amp;').replaceAll('"','&quot;') + '"><span>' + (entry.restart_required ? 'restart' : 'dynamic') + '</span></div>'
        ).join('');
      }
      async function refresh() {
        try {
          const [status, config] = await Promise.all([api('/api/admin/runtime/status'), api('/api/admin/runtime/config')]);
          renderStatus(status); renderConfig(config); setMessage('Refreshed ' + new Date().toLocaleTimeString());
        } catch (error) { setMessage(error.message); }
      }
      $('actions').innerHTML = actions.map(([id,label]) => '<button data-action="' + id + '">' + label + '</button>').join('');
      $('actions').addEventListener('click', async (event) => {
        const action = event.target.dataset.action;
        if (!action) return;
        try { const result = await api('/api/admin/runtime/action', { method: 'POST', body: JSON.stringify({ action }) }); setMessage(result.message); setTimeout(refresh, 1200); } catch (error) { setMessage(error.message); }
      });
      $('saveConfig').addEventListener('click', async () => {
        const values = {};
        document.querySelectorAll('[data-key]').forEach((input) => values[input.dataset.key] = input.value);
        try { const result = await api('/api/admin/runtime/config', { method: 'POST', body: JSON.stringify({ values }) }); renderConfig(result.config); setMessage(result.message); } catch (error) { setMessage(error.message); }
      });
      $('refresh').addEventListener('click', refresh);
      refresh();
      setInterval(refresh, 10000);
    </script>
  </body>
</html>`;
}
