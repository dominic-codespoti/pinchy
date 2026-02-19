// Pinchy Views — Sessions (browser + viewer/editor)
(function () {
  "use strict";
  window.PinchyViews = window.PinchyViews || {};

  window.PinchyViews.sessions = {
    init: function (ctx) {
      var params = ctx.params;
      // #/sessions/:agent/:file
      if (params.length >= 2 && params[0] && params[1]) {
        return initViewer(ctx, decodeURIComponent(params[0]), decodeURIComponent(params[1]));
      }
      return initBrowser(ctx);
    }
  };

  // ── Session Browser ─────────────────────────────────────

  function initBrowser(ctx) {
    var container = ctx.container;
    container.innerHTML =
      '<div class="section-header"><h2>Sessions</h2></div>' +
      '<div class="form-group" style="max-width:300px;">' +
        '<label>Agent</label>' +
        '<select id="sess-agent">' + agentOptions(ctx) + '</select>' +
      '</div>' +
      '<div id="sess-list"></div>';

    var agentSel = document.getElementById("sess-agent");
    var listEl = document.getElementById("sess-list");

    ctx.showLoading(listEl);
    agentSel.addEventListener("change", loadSessions);

    function loadSessions() {
      var agentId = agentSel.value;
      if (!agentId) { listEl.innerHTML = '<div class="placeholder">Select an agent</div>'; return; }
      ctx.showLoading(listEl);
      PinchyAPI.listSessions(agentId).then(function (data) {
        var files = data.sessions || data.files || [];
        // Filter out receipt files
        files = files.filter(function (f) {
          var name = typeof f === "string" ? f : (f.file || f.name || f.filename || "");
          return !name.endsWith(".receipts.jsonl");
        });
        if (!files.length) { listEl.innerHTML = '<div class="placeholder">No sessions</div>'; return; }
        listEl.innerHTML = "";
        files.forEach(function (f) {
          var fileName = typeof f === "string" ? f : (f.file || f.name || f.filename || "");
          var sessionId = (typeof f === "object" && f.session_id) ? f.session_id : fileName.replace(/\.jsonl$/, "");
          var modified = typeof f === "object" ? f.modified : 0;
          var size = typeof f === "object" ? f.size : 0;

          // Format the modified timestamp
          var dateStr = "";
          if (modified) {
            var d = new Date(modified * 1000);
            dateStr = d.toLocaleDateString() + " " + d.toLocaleTimeString();
          }

          // Friendly label: detect cron sessions vs interactive
          var label = sessionId;
          if (sessionId.indexOf("cron_") === 0) {
            label = "🕐 " + sessionId.replace(/_/g, " ");
          } else {
            label = "💬 " + sessionId;
          }

          // Size label
          var sizeStr = "";
          if (size) {
            sizeStr = size > 1024 ? (size / 1024).toFixed(1) + " KB" : size + " B";
          }

          var item = document.createElement("div");
          item.className = "session-item";

          var infoDiv = document.createElement("div");
          infoDiv.className = "session-info";
          infoDiv.innerHTML =
            '<span class="session-name">' + ctx.escapeHtml(label) + '</span>' +
            '<span class="session-detail">' + ctx.escapeHtml(dateStr) + (sizeStr ? " · " + sizeStr : "") + '</span>';

          var actionsDiv = document.createElement("div");
          actionsDiv.className = "session-actions";

          var delBtn = document.createElement("button");
          delBtn.className = "btn btn-sm btn-danger";
          delBtn.textContent = "✕";
          delBtn.title = "Delete session";
          delBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (!confirm("Delete session " + sessionId + "?")) return;
            // Delete both the session and its receipts file
            Promise.all([
              PinchyAPI.deleteSession(agentId, fileName).catch(function () {}),
              PinchyAPI.deleteSession(agentId, fileName.replace(/\.jsonl$/, ".receipts.jsonl")).catch(function () {})
            ]).then(function () {
              ctx.showToast("Session deleted", "success");
              loadSessions();
            });
          });
          actionsDiv.appendChild(delBtn);

          item.appendChild(infoDiv);
          item.appendChild(actionsDiv);

          item.addEventListener("click", function () {
            ctx.navigate("#/sessions/" + encodeURIComponent(agentId) + "/" + encodeURIComponent(fileName));
          });
          listEl.appendChild(item);
        });
      }).catch(function () {
        ctx.showErrorWithRetry(listEl, "Failed to load sessions", loadSessions);
      });
    }

    if (agentSel.value) loadSessions();

    return {
      refresh: loadSessions,
      destroy: function () {},
    };
  }

  // ── Session Viewer / Editor ─────────────────────────────

  function initViewer(ctx, agentId, fileName) {
    var container = ctx.container;
    var messages = [];
    var editingIndex = -1;

    container.innerHTML =
      '<div class="section-header">' +
        '<h2><button class="btn btn-ghost" id="sess-back" style="font-size:1rem;">◀</button> ' + ctx.escapeHtml(fileName) + '</h2>' +
        '<div style="display:flex;gap:0.3rem;">' +
          '<button class="btn btn-sm btn-secondary" id="sess-download">⬇ Export</button>' +
          '<button class="btn btn-sm btn-danger" id="sess-delete">Delete</button>' +
        '</div>' +
      '</div>' +
      '<p style="font-size:0.72rem;color:var(--text-tertiary);margin-bottom:0.5rem;">Agent: ' + ctx.escapeHtml(agentId) + ' · Click a message to edit</p>' +
      '<div class="chat-messages" id="sess-messages"><div class="loading">Loading…</div></div>';

    var msgsEl = document.getElementById("sess-messages");

    document.getElementById("sess-back").addEventListener("click", function () {
      ctx.navigate("#/sessions");
    });

    document.getElementById("sess-download").addEventListener("click", function () {
      var jsonl = messages.map(function (m) { return JSON.stringify(m); }).join("\n");
      var blob = new Blob([jsonl], { type: "application/jsonl" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
    });

    document.getElementById("sess-delete").addEventListener("click", function () {
      if (!confirm("Delete session " + fileName + "?")) return;
      PinchyAPI.deleteSession(agentId, fileName).then(function () {
        ctx.showToast("Session deleted", "success");
        ctx.navigate("#/sessions");
      }).catch(function (err) {
        ctx.showToast("Delete failed: " + err.message, "error");
      });
    });

    function load() {
      ctx.showLoading(msgsEl);
      PinchyAPI.getSession(agentId, fileName).then(function (data) {
        messages = data.messages || data || [];
        renderMessages();
      }).catch(function () {
        ctx.showError(msgsEl, "Failed to load session");
      });
    }

    function renderMessages() {
      msgsEl.innerHTML = "";
      messages.forEach(function (msg, idx) {
        var role = (msg.role || "system").toLowerCase();
        var content = msg.content || "";
        var isTool = role === "tool_call" || role === "tool_result" || role === "tool";

        var div = document.createElement("div");
        div.className = "chat-msg " + (isTool ? "tool" : role);

        if (editingIndex === idx) {
          // Inline editor
          div.innerHTML =
            '<div class="msg-edit-wrap">' +
              '<textarea id="msg-edit-area">' + ctx.escapeHtml(content) + '</textarea>' +
              '<div class="msg-edit-actions">' +
                '<button class="btn btn-sm btn-secondary" data-action="cancel">Cancel</button>' +
                '<button class="btn btn-sm btn-danger" data-action="delete">Delete</button>' +
                '<button class="btn btn-sm btn-primary" data-action="save">Save</button>' +
              '</div>' +
            '</div>';
          div.querySelector('[data-action="cancel"]').addEventListener("click", function (e) {
            e.stopPropagation();
            editingIndex = -1;
            renderMessages();
          });
          div.querySelector('[data-action="delete"]').addEventListener("click", function (e) {
            e.stopPropagation();
            messages.splice(idx, 1);
            editingIndex = -1;
            saveAndRender();
          });
          div.querySelector('[data-action="save"]').addEventListener("click", function (e) {
            e.stopPropagation();
            messages[idx].content = document.getElementById("msg-edit-area").value;
            editingIndex = -1;
            saveAndRender();
          });
        } else {
          var roleLabel = document.createElement("div");
          roleLabel.className = "msg-role";
          roleLabel.textContent = role;

          var contentEl = document.createElement("div");
          contentEl.textContent = content;

          div.appendChild(roleLabel);
          div.appendChild(contentEl);

          if (msg.timestamp) {
            var tsEl = document.createElement("div");
            tsEl.className = "msg-ts";
            var d = typeof msg.timestamp === "number" ? new Date(msg.timestamp * 1000) : new Date(msg.timestamp);
            tsEl.textContent = d.toLocaleTimeString();
            div.appendChild(tsEl);
          }

          div.addEventListener("click", function () {
            editingIndex = idx;
            renderMessages();
            var ta = document.getElementById("msg-edit-area");
            if (ta) ta.focus();
          });
        }

        msgsEl.appendChild(div);
      });

      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function saveAndRender() {
      PinchyAPI.updateSession(agentId, fileName, messages).then(function () {
        ctx.showToast("Session saved", "success");
        renderMessages();
      }).catch(function (err) {
        ctx.showToast("Save failed: " + err.message, "error");
        renderMessages();
      });
    }

    load();

    return {
      refresh: load,
      destroy: function () {},
    };
  }

  function agentOptions(ctx) {
    var agents = ctx.state.agents || [];
    if (!agents.length) agents = ["default"];
    return agents.map(function (a) {
      return '<option value="' + a + '">' + a + '</option>';
    }).join("");
  }
})();
