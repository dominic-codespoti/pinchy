// Pinchy Views — Agents (list + editor)
(function () {
  "use strict";
  window.PinchyViews = window.PinchyViews || {};

  window.PinchyViews.agents = {
    init: function (ctx) {
      var container = ctx.container;
      var params = ctx.params; // e.g. ["default"] for #/agents/default

      if (params.length > 0 && params[0]) {
        return initEditor(ctx, params[0]);
      }
      return initList(ctx);
    }
  };

  // ── Agent List ──────────────────────────────────────────

  function initList(ctx) {
    var container = ctx.container;
    container.innerHTML =
      '<div class="section-header">' +
        '<h2>Agents</h2>' +
        '<button class="btn btn-primary" id="btn-create-agent">+ Create Agent</button>' +
      '</div>' +
      '<div class="grid-3" id="agents-grid"></div>';

    var grid = document.getElementById("agents-grid");
    ctx.showLoading(grid);
    var btnCreate = document.getElementById("btn-create-agent");

    function load() {
      // Try /api/agents first, fall back to config
      PinchyAPI.listAgents().then(function (data) {
        renderAgents(data.agents || []);
      }).catch(function () {
        // Fallback: get from config
        PinchyAPI.getConfig().then(function (cfg) {
          renderAgents(cfg.agents || []);
        }).catch(function () {
          ctx.showErrorWithRetry(grid, "Failed to load agents", load);
        });
      });
    }

    function renderAgents(agents) {
      grid.innerHTML = "";
      if (!agents.length) {
        grid.innerHTML = '<div class="placeholder">No agents configured</div>';
        return;
      }
      agents.forEach(function (a) {
        var id = a.id || a;
        var card = document.createElement("div");
        card.className = "card";
        card.style.cursor = "pointer";
        var hbDisplay = a.heartbeat_secs ? a.heartbeat_secs + 's' : 'disabled';
        var skillsArr = a.enabled_skills || [];
        var skillsDisplay = skillsArr.length ? skillsArr.length + ' enabled' : 'none';
        var cronDisplay = a.cron_job_count != null ? a.cron_job_count : '—';
        card.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">' +
            '<h3 style="font-size:0.95rem;">' + ctx.escapeHtml(id) + '</h3>' +
          '</div>' +
          '<p style="font-size:0.76rem;color:var(--text-secondary);">Model: ' + ctx.escapeHtml(a.model || "default") + '</p>' +
          '<p style="font-size:0.76rem;color:var(--text-secondary);">Heartbeat: ' + hbDisplay + '</p>' +
          '<p style="font-size:0.76rem;color:var(--text-secondary);">Skills: ' + skillsDisplay + '</p>' +
          '<p style="font-size:0.76rem;color:var(--text-secondary);">Cron Jobs: ' + cronDisplay + '</p>';
        card.addEventListener("click", function () {
          ctx.navigate("#/agents/" + encodeURIComponent(id));
        });
        grid.appendChild(card);
      });
    }

    btnCreate.addEventListener("click", function () {
      showCreateModal(ctx, load);
    });

    load();

    return {
      refresh: load,
      destroy: function () {},
    };
  }

  // ── Create Agent Modal ──────────────────────────────────

  function showCreateModal(ctx, onCreated) {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML =
      '<div class="modal-box">' +
        '<h3>Create Agent</h3>' +
        '<div class="form-group"><label>Agent ID</label><input type="text" id="new-agent-id" placeholder="my-agent"></div>' +
        '<div class="form-group"><label>Model</label><input type="text" id="new-agent-model" placeholder="copilot-default"></div>' +
        '<div class="form-group"><label>Heartbeat (seconds)</label><input type="number" id="new-agent-hb" placeholder="300" value="300"></div>' +
        '<div class="form-actions">' +
          '<button class="btn btn-secondary" id="new-agent-cancel">Cancel</button>' +
          '<button class="btn btn-primary" id="new-agent-save">Create</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector("#new-agent-cancel").addEventListener("click", function () { overlay.remove(); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#new-agent-save").addEventListener("click", function () {
      var id = overlay.querySelector("#new-agent-id").value.trim();
      var model = overlay.querySelector("#new-agent-model").value.trim() || "copilot-default";
      var hb = parseInt(overlay.querySelector("#new-agent-hb").value) || 300;
      if (!id) { ctx.showToast("Agent ID is required", "error"); return; }
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) { ctx.showToast("Agent ID must be alphanumeric/dashes/underscores", "error"); return; }

      PinchyAPI.createAgent({ id: id, model: model, heartbeat_secs: hb }).then(function () {
        ctx.showToast("Agent created: " + id, "success");
        overlay.remove();
        if (onCreated) onCreated();
      }).catch(function (err) {
        ctx.showToast("Failed: " + err.message, "error");
      });
    });
  }

  // ── Agent Editor ────────────────────────────────────────

  function initEditor(ctx, agentId) {
    var container = ctx.container;
    container.innerHTML =
      '<div class="section-header">' +
        '<h2><button class="btn btn-ghost" id="btn-back" style="font-size:1rem;">◀</button> Agent: ' + ctx.escapeHtml(agentId) + '</h2>' +
        '<button class="btn btn-danger btn-sm" id="btn-delete-agent">Delete Agent</button>' +
      '</div>' +
      '<div class="tabs" id="agent-tabs"></div>' +
      '<div id="agent-tab-content"></div>';

    var tabsEl = document.getElementById("agent-tabs");
    var contentEl = document.getElementById("agent-tab-content");
    var activeTab = "settings";

    document.getElementById("btn-back").addEventListener("click", function () {
      ctx.navigate("#/agents");
    });

    document.getElementById("btn-delete-agent").addEventListener("click", function () {
      if (!confirm("Delete agent '" + agentId + "'? This cannot be undone.")) return;
      PinchyAPI.deleteAgent(agentId).then(function () {
        ctx.showToast("Agent deleted: " + agentId, "success");
        ctx.navigate("#/agents");
      }).catch(function (err) {
        ctx.showToast("Delete failed: " + err.message, "error");
      });
    });

    var tabs = ["Settings", "Skills", "SOUL.md", "TOOLS.md", "HEARTBEAT.md", "Sessions"];
    tabs.forEach(function (name) {
      var btn = document.createElement("button");
      btn.className = "tab" + (name.toLowerCase().replace(/\./g, "") === activeTab ? " active" : "");
      btn.textContent = name;
      btn.addEventListener("click", function () {
        activeTab = name;
        tabsEl.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
        btn.classList.add("active");
        renderTab(name);
      });
      tabsEl.appendChild(btn);
    });

    function renderTab(name) {
      if (name === "Settings") renderSettings();
      else if (name === "Skills") renderSkills();
      else if (name === "Sessions") renderSessions();
      else renderFileEditor(name);
    }

    function renderSettings() {
      ctx.showLoading(contentEl);
      PinchyAPI.getAgent(agentId).then(function (agent) {
        contentEl.innerHTML =
          '<div class="card-static" style="max-width:600px;">' +
            '<div class="form-group"><label>Agent ID</label><input type="text" id="ed-id" value="' + ctx.escapeHtml(agent.id || agentId) + '" disabled></div>' +
            '<div class="form-group"><label>Model</label><input type="text" id="ed-model" value="' + ctx.escapeHtml(agent.model || "") + '"></div>' +
            '<div class="form-group"><label>Heartbeat (seconds)</label><input type="number" id="ed-hb" value="' + (agent.heartbeat_secs || 300) + '"></div>' +
            '<div class="form-group"><label>Max Tool Iterations</label><input type="number" id="ed-max-tools" value="' + (agent.max_tool_iterations || 15) + '"></div>' +
            '<div class="form-actions"><button class="btn btn-primary" id="ed-save">Save</button></div>' +
          '</div>';
        document.getElementById("ed-save").addEventListener("click", function () {
          var data = {
            model: document.getElementById("ed-model").value.trim(),
            heartbeat_secs: parseInt(document.getElementById("ed-hb").value) || 300,
            max_tool_iterations: parseInt(document.getElementById("ed-max-tools").value) || 15,
          };
          PinchyAPI.updateAgent(agentId, data).then(function () {
            ctx.showToast("Agent updated", "success");
          }).catch(function (err) {
            ctx.showToast("Update failed: " + err.message, "error");
          });
        });
      }).catch(function () {
        // Fallback: show basic form
        contentEl.innerHTML =
          '<div class="card-static" style="max-width:600px;">' +
            '<div class="form-group"><label>Agent ID</label><input type="text" value="' + ctx.escapeHtml(agentId) + '" disabled></div>' +
            '<div class="placeholder">Agent API not available — try editing config.yaml directly via the Config page.</div>' +
          '</div>';
      });
    }

    function renderSkills() {
      ctx.showLoading(contentEl);
      Promise.all([
        PinchyAPI.getSkills(),
        PinchyAPI.getAgent(agentId),
      ]).then(function (results) {
        var allSkills = (results[0] && results[0].skills) || [];
        var agent = results[1] || {};
        var enabledSkills = agent.enabled_skills || [];

        if (!allSkills.length) {
          contentEl.innerHTML =
            '<div class="card-static" style="max-width:600px;">' +
              '<p style="color:var(--text-secondary);">No global skills found in <code>skills/global/</code>.</p>' +
            '</div>';
          return;
        }

        var html =
          '<div class="card-static" style="max-width:600px;">' +
            '<p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.75rem;">Toggle which global skills this agent can use.</p>' +
            '<div id="skills-list">';

        allSkills.forEach(function (skill) {
          var checked = enabledSkills.indexOf(skill.id) >= 0 ? ' checked' : '';
          html +=
            '<label style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;cursor:pointer;">' +
              '<input type="checkbox" class="skill-cb" data-skill-id="' + ctx.escapeHtml(skill.id) + '"' + checked + '>' +
              '<span style="font-weight:500;">' + ctx.escapeHtml(skill.id) + '</span>' +
              (skill.description ? '<span style="color:var(--text-secondary);font-size:0.76rem;margin-left:0.25rem;">— ' + ctx.escapeHtml(skill.description) + '</span>' : '') +
            '</label>';
        });

        html +=
            '</div>' +
            '<div class="form-actions" style="margin-top:0.75rem;">' +
              '<button class="btn btn-primary" id="skills-save">Save Skills</button>' +
            '</div>' +
          '</div>';

        contentEl.innerHTML = html;

        document.getElementById("skills-save").addEventListener("click", function () {
          var cbs = contentEl.querySelectorAll(".skill-cb");
          var selected = [];
          cbs.forEach(function (cb) {
            if (cb.checked) selected.push(cb.getAttribute("data-skill-id"));
          });
          var payload = { enabled_skills: selected.length ? selected : null };
          PinchyAPI.updateAgent(agentId, payload).then(function () {
            ctx.showToast("Skills updated", "success");
          }).catch(function (err) {
            ctx.showToast("Save failed: " + err.message, "error");
          });
        });
      }).catch(function (err) {
        ctx.showError(contentEl, "Failed to load skills: " + (err.message || String(err)));
      });
    }

    function renderFileEditor(filename) {
      ctx.showLoading(contentEl);
      PinchyAPI.getAgentFile(agentId, filename).then(function (data) {
        var content = typeof data === "string" ? data : (data.content || "");
        contentEl.innerHTML =
          '<div class="form-group">' +
            '<textarea id="file-editor" rows="20" style="min-height:300px;">' + ctx.escapeHtml(content) + '</textarea>' +
          '</div>' +
          '<div class="form-actions">' +
            '<button class="btn btn-primary" id="file-save">Save ' + ctx.escapeHtml(filename) + '</button>' +
          '</div>';
        document.getElementById("file-save").addEventListener("click", function () {
          var val = document.getElementById("file-editor").value;
          PinchyAPI.saveAgentFile(agentId, filename, val).then(function () {
            ctx.showToast("Saved " + filename, "success");
          }).catch(function (err) {
            ctx.showToast("Save failed: " + err.message, "error");
          });
        });
      }).catch(function () {
        contentEl.innerHTML =
          '<div class="form-group">' +
            '<textarea id="file-editor" rows="20" style="min-height:300px;" placeholder="File is empty or does not exist yet. Start typing to create it…"></textarea>' +
          '</div>' +
          '<div class="form-actions">' +
            '<button class="btn btn-primary" id="file-save">Save ' + ctx.escapeHtml(filename) + '</button>' +
          '</div>';
        document.getElementById("file-save").addEventListener("click", function () {
          var val = document.getElementById("file-editor").value;
          PinchyAPI.saveAgentFile(agentId, filename, val).then(function () {
            ctx.showToast("Created " + filename, "success");
          }).catch(function (err) {
            ctx.showToast("Save failed: " + err.message, "error");
          });
        });
      });
    }

    function renderSessions() {
      ctx.showLoading(contentEl);
      PinchyAPI.listSessions(agentId).then(function (data) {
        var sessions = data.sessions || data.files || [];
        if (!sessions.length) {
          contentEl.innerHTML = '<div class="placeholder">No sessions found</div>';
          return;
        }
        contentEl.innerHTML = "";
        sessions.forEach(function (s) {
          var name = typeof s === "string" ? s : s.name || s.filename;
          var item = document.createElement("div");
          item.className = "session-item";
          item.innerHTML = '<span class="session-name">' + ctx.escapeHtml(name) + '</span>';
          item.addEventListener("click", function () {
            ctx.navigate("#/sessions/" + encodeURIComponent(agentId) + "/" + encodeURIComponent(name));
          });
          contentEl.appendChild(item);
        });
      }).catch(function () {
        ctx.showError(contentEl, "Failed to load sessions");
      });
    }

    // Initial render
    renderTab("Settings");

    return {
      destroy: function () {},
    };
  }
})();
