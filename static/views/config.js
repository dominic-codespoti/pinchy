// Pinchy Views — Config Editor (form + raw YAML)
(function () {
  "use strict";
  window.PinchyViews = window.PinchyViews || {};

  window.PinchyViews.config = {
    init: function (ctx) {
      var container = ctx.container;
      var mode = "form"; // "form" or "raw"
      var configData = null;
      var rawYaml = "";

      container.innerHTML =
        '<div class="section-header">' +
          '<h2>Configuration</h2>' +
          '<div style="display:flex;gap:0.4rem;align-items:center;">' +
            '<span style="font-size:0.72rem;color:var(--text-tertiary);">config.yaml</span>' +
            '<button class="btn btn-sm btn-secondary" id="cfg-mode-toggle">Switch to Raw YAML</button>' +
          '</div>' +
        '</div>' +
        '<div id="cfg-content"><div class="loading">Loading…</div></div>';

      var contentEl = document.getElementById("cfg-content");
      var toggleBtn = document.getElementById("cfg-mode-toggle");

      toggleBtn.addEventListener("click", function () {
        mode = mode === "form" ? "raw" : "form";
        toggleBtn.textContent = mode === "form" ? "Switch to Raw YAML" : "Switch to Form";
        render();
      });

      function load() {
        ctx.showLoading(contentEl);
        PinchyAPI.getConfig().then(function (data) {
          configData = data;
          rawYaml = jsonToYaml(data);
          render();
        }).catch(function (err) {
          ctx.showError(contentEl, "Failed to load config: " + err.message);
        });
      }

      function render() {
        if (mode === "raw") renderRaw();
        else renderForm();
      }

      // ── Raw YAML view ───────────────────────────────────

      function renderRaw() {
        contentEl.innerHTML =
          '<div class="form-group">' +
            '<textarea id="cfg-raw" rows="30" style="min-height:400px;font-family:monospace;font-size:0.8125rem;white-space:pre;tab-size:2;">' +
            ctx.escapeHtml(rawYaml) +
            '</textarea>' +
          '</div>' +
          '<div class="form-actions">' +
            '<button class="btn btn-secondary" id="cfg-raw-reset">Reset</button>' +
            '<button class="btn btn-primary" id="cfg-raw-save">Save</button>' +
          '</div>';

        document.getElementById("cfg-raw-reset").addEventListener("click", function () {
          document.getElementById("cfg-raw").value = rawYaml;
        });

        document.getElementById("cfg-raw-save").addEventListener("click", function () {
          var val = document.getElementById("cfg-raw").value;
          var parsed;
          try {
            parsed = yamlToJson(val);
          } catch (e) {
            ctx.showToast("Invalid YAML: " + e.message, "error");
            return;
          }
          saveConfig(parsed);
        });
      }

      // ── Form view ───────────────────────────────────────

      function renderForm() {
        if (!configData) { contentEl.innerHTML = '<div class="placeholder">No config loaded</div>'; return; }

        var html = '';

        // Models section
        html += '<section class="card-static" style="margin-bottom:1rem;">';
        html += '<div class="section-header" style="margin-bottom:0.75rem;"><h3 style="font-size:0.88rem;color:var(--accent);">Model Providers</h3></div>';
        var models = configData.models || [];
        models.forEach(function (m, i) {
          html += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.75rem;margin-bottom:0.5rem;">';
          html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;">';
          html += formField("ID", "cfg-m-id-"+i, m.id || "");
          html += formField("Provider", "cfg-m-prov-"+i, m.provider || "");
          html += formField("Model", "cfg-m-model-"+i, m.model || "");
          html += '</div>';
          html += '<div class="form-group" style="margin-top:0.5rem;margin-bottom:0;">';
          html += '<label>API Key</label>';
          html += '<input type="password" id="cfg-m-key-'+i+'" value="' + ctx.escapeHtml(m.api_key || "") + '" placeholder="$ENV_VAR or literal key">';
          html += '<span class="form-hint">Use $ENV_VAR for environment variable reference</span>';
          html += '</div></div>';
        });
        html += '</section>';

        // Channels section
        html += '<section class="card-static" style="margin-bottom:1rem;">';
        html += '<h3 style="font-size:0.88rem;color:var(--accent);margin-bottom:0.75rem;">Channels</h3>';
        var discord = (configData.channels && configData.channels.discord) || {};
        html += '<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.75rem;">';
        html += '<h4 style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.5rem;">Discord</h4>';
        html += '<div class="form-group" style="margin-bottom:0.5rem;">';
        html += '<label>Token</label>';
        html += '<input type="password" id="cfg-discord-token" value="' + ctx.escapeHtml(discord.token || "") + '">';
        html += '<span class="form-hint">@KEY = secrets file · $KEY = env var</span>';
        html += '</div></div>';
        html += '</section>';

        // Agents summary
        html += '<section class="card-static" style="margin-bottom:1rem;">';
        html += '<h3 style="font-size:0.88rem;color:var(--accent);margin-bottom:0.75rem;">Agents</h3>';
        var agents = configData.agents || [];
        agents.forEach(function (a) {
          html += '<p style="font-size:0.82rem;color:var(--text-secondary);padding:0.2rem 0;">• ' + ctx.escapeHtml(a.id || "unknown") + ' — model: ' + ctx.escapeHtml(a.model || "default") + '</p>';
        });
        html += '<p class="form-hint" style="margin-top:0.5rem;">Edit agents in the <a href="#/agents" style="color:var(--accent);">Agents</a> page.</p>';
        html += '</section>';

        // Save
        html += '<div class="form-actions">';
        html += '<button class="btn btn-primary" id="cfg-form-save">Save Config</button>';
        html += '</div>';

        contentEl.innerHTML = html;

        document.getElementById("cfg-form-save").addEventListener("click", function () {
          // Collect form data back into configData
          var models = configData.models || [];
          models.forEach(function (m, i) {
            m.id = (document.getElementById("cfg-m-id-"+i) || {}).value || m.id;
            m.provider = (document.getElementById("cfg-m-prov-"+i) || {}).value || m.provider;
            m.model = (document.getElementById("cfg-m-model-"+i) || {}).value || m.model;
            m.api_key = (document.getElementById("cfg-m-key-"+i) || {}).value || m.api_key;
          });
          var dt = (document.getElementById("cfg-discord-token") || {}).value;
          if (dt !== undefined) {
            configData.channels = configData.channels || {};
            configData.channels.discord = configData.channels.discord || {};
            configData.channels.discord.token = dt;
          }
          saveConfig(configData);
        });
      }

      function formField(label, id, value) {
        return '<div class="form-group" style="margin-bottom:0;"><label>' + ctx.escapeHtml(label) + '</label><input type="text" id="'+id+'" value="' + ctx.escapeHtml(value) + '"></div>';
      }

      function saveConfig(data) {
        PinchyAPI.saveConfig(data).then(function () {
          ctx.showToast("Config saved", "success");
          configData = data;
          rawYaml = jsonToYaml(data);
        }).catch(function (err) {
          ctx.showToast("Save failed: " + err.message, "error");
        });
      }

      load();

      return {
        refresh: load,
        destroy: function () {},
      };
    }
  };

  // ── Minimal JSON ↔ YAML helpers ─────────────────────────
  // These handle the subset of YAML needed for config.yaml.
  // Not a full YAML parser — just enough for the config.

  function jsonToYaml(obj, indent) {
    indent = indent || 0;
    var pad = "  ".repeat(indent);
    var lines = [];
    if (Array.isArray(obj)) {
      obj.forEach(function (item) {
        if (typeof item === "object" && item !== null) {
          var inner = jsonToYaml(item, indent + 1).split("\n");
          lines.push(pad + "- " + inner[0].trim());
          for (var i = 1; i < inner.length; i++) {
            if (inner[i].trim()) lines.push(pad + "  " + inner[i].trim());
          }
        } else {
          lines.push(pad + "- " + yamlValue(item));
        }
      });
    } else if (typeof obj === "object" && obj !== null) {
      Object.keys(obj).forEach(function (key) {
        var val = obj[key];
        if (val === null || val === undefined) {
          lines.push(pad + key + ": null");
        } else if (typeof val === "object") {
          lines.push(pad + key + ":");
          lines.push(jsonToYaml(val, indent + 1));
        } else {
          lines.push(pad + key + ": " + yamlValue(val));
        }
      });
    }
    return lines.join("\n");
  }

  function yamlValue(v) {
    if (typeof v === "string") {
      if (v === "" || /[:#{}[\],&*?|>!%@`]/.test(v) || /^\s|\s$/.test(v)) {
        return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
      }
      return v;
    }
    return String(v);
  }

  function yamlToJson(text) {
    // Very minimal YAML parser for flat/nested config
    // Falls back to JSON.parse if the text looks like JSON
    var trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return JSON.parse(trimmed);
    }

    var result = {};
    var lines = text.split("\n");
    var stack = [{ obj: result, indent: -1 }];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var stripped = line.replace(/\s+$/, "");
      if (!stripped || stripped.trim().startsWith("#")) continue;

      var indent = line.search(/\S/);
      var content = stripped.trim();

      // Pop stack to correct level
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      var parent = stack[stack.length - 1].obj;

      // Array item
      if (content.startsWith("- ")) {
        if (!Array.isArray(parent)) {
          // Convert last key to array
          var keys = Object.keys(parent);
          var lastKey = keys[keys.length - 1];
          if (lastKey && (parent[lastKey] === null || parent[lastKey] === undefined || (typeof parent[lastKey] === "object" && !Array.isArray(parent[lastKey]) && Object.keys(parent[lastKey]).length === 0))) {
            parent[lastKey] = [];
            stack.push({ obj: parent[lastKey], indent: indent });
            parent = parent[lastKey];
          }
        }
        var itemContent = content.slice(2).trim();
        if (itemContent.includes(": ")) {
          var item = {};
          var kv = parseKV(itemContent);
          item[kv.key] = kv.value;
          parent.push(item);
          stack.push({ obj: item, indent: indent + 2 });
        } else {
          parent.push(parseValue(itemContent));
        }
        continue;
      }

      // Key: value
      var colonPos = content.indexOf(":");
      if (colonPos > 0) {
        var key = content.slice(0, colonPos).trim();
        var val = content.slice(colonPos + 1).trim();
        if (val === "" || val === null) {
          parent[key] = {};
          stack.push({ obj: parent[key], indent: indent });
        } else {
          parent[key] = parseValue(val);
        }
      }
    }

    return result;
  }

  function parseKV(s) {
    var pos = s.indexOf(": ");
    if (pos < 0) return { key: s, value: null };
    return { key: s.slice(0, pos).trim(), value: parseValue(s.slice(pos + 2).trim()) };
  }

  function parseValue(s) {
    if (s === "null" || s === "~") return null;
    if (s === "true") return true;
    if (s === "false") return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    // Strip quotes
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }
})();
