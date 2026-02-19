// Pinchy Views — Cron Jobs (CRUD + expression helper)
(function () {
  "use strict";
  window.PinchyViews = window.PinchyViews || {};

  // Permissive cron regex
  var CRON_RE = /^(@(annually|yearly|monthly|weekly|daily|midnight|hourly|reboot|every\s+\S+))$|^(\S+\s+){4,6}\S+$/i;

  window.PinchyViews.cron = {
    init: function (ctx) {
      var container = ctx.container;
      var cachedJobs = [];

      container.innerHTML =
        '<div class="section-header">' +
          '<h2>Cron Jobs</h2>' +
          '<button class="btn btn-primary" id="cron-add">+ Add Job</button>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table><thead><tr>' +
            '<th>Name</th><th>Schedule</th><th>Agent</th><th>Kind</th><th>Status</th><th>Actions</th>' +
          '</tr></thead><tbody id="cron-tbody"><tr><td colspan="6" class="placeholder">Loading…</td></tr></tbody></table>' +
        '</div>' +
        '<div id="cron-runs" style="margin-top:1rem;"></div>';

      var tbody = document.getElementById("cron-tbody");
      var runsEl = document.getElementById("cron-runs");

      document.getElementById("cron-add").addEventListener("click", function () {
        showJobModal(ctx, null, loadJobs);
      });

      function loadJobs() {
        PinchyAPI.listCronJobs().then(function (data) {
          cachedJobs = data.jobs || [];
          renderTable(cachedJobs);
        }).catch(function () {
          tbody.innerHTML = '';
          var tr = document.createElement('tr');
          var td = document.createElement('td');
          td.colSpan = 6;
          ctx.showErrorWithRetry(td, "Failed to load cron jobs", loadJobs);
          tr.appendChild(td);
          tbody.appendChild(tr);
        });
      }

      function renderTable(jobs) {
        tbody.innerHTML = "";
        if (!jobs.length) {
          tbody.innerHTML = '<tr><td colspan="6" class="placeholder">No cron jobs configured</td></tr>';
          return;
        }
        jobs.forEach(function (job) {
          var tr = document.createElement("tr");
          var status = job.last_status || "PENDING";
          var statusCls = status.toLowerCase().replace(/^failed.*/, "failed");
          var kind = job.kind || "Recurring";
          tr.innerHTML =
            '<td>' + ctx.escapeHtml(job.name || job.id) + '</td>' +
            '<td><code style="font-size:0.78rem;">' + ctx.escapeHtml(job.schedule || "") + '</code></td>' +
            '<td>' + ctx.escapeHtml(job.agent_id || "") + '</td>' +
            '<td style="font-size:0.75rem;">' + ctx.escapeHtml(kind) + '</td>' +
            '<td><span class="badge badge-' + badgeClass(statusCls) + '">' + ctx.escapeHtml(status) + '</span></td>' +
            '<td></td>';
          var actionsCell = tr.lastElementChild;

          var btnEdit = createBtn("Edit", "btn-secondary btn-sm", function () {
            showJobModal(ctx, job, loadJobs);
          });
          var btnRun = createBtn("Run", "btn-primary btn-sm", function () {
            ctx.sendCommand("/cron run " + (job.id || job.name));
            ctx.showToast("Triggered: " + (job.name || job.id), "info");
          });
          var btnHistory = createBtn("History", "btn-ghost btn-sm", function () {
            showRunHistory(ctx, job, runsEl);
          });
          var btnDel = createBtn("Delete", "btn-danger btn-sm", function () {
            if (!confirm("Delete cron job " + (job.name || job.id) + "?")) return;
            PinchyAPI.deleteCronJob(job.id || job.name).then(function () {
              ctx.showToast("Deleted: " + (job.name || job.id), "success");
              loadJobs();
            }).catch(function (err) {
              ctx.showToast("Delete failed: " + err.message, "error");
            });
          });

          actionsCell.append(btnEdit, btnRun, btnHistory, btnDel);
          tbody.appendChild(tr);
        });
      }

      loadJobs();

      return {
        refresh: loadJobs,
        onEvent: function (data) {
          var lt = (data.type || "").toLowerCase();
          if (lt.indexOf("cron") >= 0) loadJobs();
        },
        destroy: function () {},
      };
    }
  };

  function createBtn(text, cls, handler) {
    var btn = document.createElement("button");
    btn.className = "btn " + cls;
    btn.textContent = text;
    btn.style.marginRight = "4px";
    btn.addEventListener("click", handler);
    return btn;
  }

  function badgeClass(status) {
    switch (status) {
      case "success": return "ok";
      case "running": return "running";
      case "failed": return "error";
      case "pending": return "pending";
      default: return "pending";
    }
  }

  // ── Job Modal (Add / Edit) ──────────────────────────────

  function showJobModal(ctx, job, onDone) {
    var isEdit = !!job;
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    var agents = ctx.state.agents || ["default"];
    var agentOpts = agents.map(function (a) {
      var sel = (job && job.agent_id === a) ? " selected" : "";
      return '<option value="' + a + '"' + sel + '>' + a + '</option>';
    }).join("");

    overlay.innerHTML =
      '<div class="modal-box">' +
        '<h3>' + (isEdit ? "Edit Cron Job" : "Add Cron Job") + '</h3>' +
        '<div class="form-group"><label>Name</label><input type="text" id="cj-name" value="' + (job ? ctx.escapeHtml(job.name || "") : "") + '" placeholder="daily-check">' +
          '<span class="field-error" id="cj-err-name"></span></div>' +
        '<div class="form-group"><label>Schedule (cron expression)</label><input type="text" id="cj-schedule" value="' + (job ? ctx.escapeHtml(job.schedule || "") : "") + '" placeholder="0 0 * * *">' +
          '<span class="field-error" id="cj-err-schedule"></span>' +
          '<div id="cj-helper"></div></div>' +
        '<div class="form-group"><label>Agent</label><select id="cj-agent">' + agentOpts + '</select>' +
          '<span class="field-error" id="cj-err-agent"></span></div>' +
        '<div class="form-group"><label>Message / prompt</label><textarea id="cj-message" rows="3" placeholder="Run daily health check">' + (job ? ctx.escapeHtml(job.message || "") : "") + '</textarea>' +
          '<span class="field-error" id="cj-err-message"></span></div>' +
        '<div class="form-group" style="display:flex;align-items:center;gap:0.5rem;">' +
          '<input type="checkbox" id="cj-oneshot"' + (job && job.kind === "OneShot" ? " checked" : "") + ' style="width:auto;">' +
          '<label for="cj-oneshot" style="margin-bottom:0;">One-shot (run once then remove)</label>' +
        '</div>' +
        '<div class="form-actions">' +
          '<button class="btn btn-secondary" id="cj-cancel">Cancel</button>' +
          '<button class="btn btn-primary" id="cj-save">' + (isEdit ? "Save" : "Create") + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var scheduleInput = overlay.querySelector("#cj-schedule");
    var helperEl = overlay.querySelector("#cj-helper");

    // Cron expression helper
    scheduleInput.addEventListener("input", function () {
      renderCronHelper(helperEl, scheduleInput.value.trim());
    });
    if (job && job.schedule) renderCronHelper(helperEl, job.schedule);

    overlay.querySelector("#cj-cancel").addEventListener("click", function () { overlay.remove(); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });

    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", escHandler); }
    });

    overlay.querySelector("#cj-save").addEventListener("click", function () {
      // Validate
      clearErrors(overlay);
      var valid = true;
      var name = overlay.querySelector("#cj-name").value.trim();
      var schedule = scheduleInput.value.trim();
      var agent = overlay.querySelector("#cj-agent").value;
      var message = overlay.querySelector("#cj-message").value.trim();
      var oneShot = overlay.querySelector("#cj-oneshot").checked;

      if (!name) { setError(overlay, "cj-name", "cj-err-name", "Name is required"); valid = false; }
      if (!schedule) { setError(overlay, "cj-schedule", "cj-err-schedule", "Schedule is required"); valid = false; }
      else if (!CRON_RE.test(schedule)) { setError(overlay, "cj-schedule", "cj-err-schedule", "Invalid cron expression"); valid = false; }
      if (!agent) { setError(overlay, "cj-agent", "cj-err-agent", "Select an agent"); valid = false; }
      if (!message) { setError(overlay, "cj-message", "cj-err-message", "Message is required"); valid = false; }
      if (!valid) return;

      var data = { name: name, schedule: schedule, agent_id: agent, message: message, one_shot: oneShot };

      var promise;
      if (isEdit) {
        promise = PinchyAPI.updateCronJob(job.id || job.name, data);
      } else {
        promise = PinchyAPI.createCronJob(data);
      }

      promise.then(function () {
        ctx.showToast((isEdit ? "Updated" : "Created") + " cron job: " + name, "success");
        overlay.remove();
        if (onDone) onDone();
      }).catch(function (err) {
        ctx.showToast("Failed: " + err.message, "error");
      });
    });
  }

  function clearErrors(root) {
    root.querySelectorAll(".field-error").forEach(function (el) { el.textContent = ""; });
    root.querySelectorAll(".invalid").forEach(function (el) { el.classList.remove("invalid"); });
  }

  function setError(root, inputId, errorId, msg) {
    var inp = root.querySelector("#" + inputId);
    var err = root.querySelector("#" + errorId);
    if (inp) inp.classList.add("invalid");
    if (err) err.textContent = msg;
  }

  // ── Cron Expression Helper ──────────────────────────────

  function renderCronHelper(container, expr) {
    if (!expr || !CRON_RE.test(expr)) {
      container.innerHTML = "";
      return;
    }

    if (expr.startsWith("@")) {
      container.innerHTML = '<div class="cron-helper">Shortcut: <strong>' + expr + '</strong></div>';
      return;
    }

    var parts = expr.split(/\s+/);
    var labels = ["Minute", "Hour", "Day", "Month", "Weekday", "Second", "Year"];
    var fieldHtml = "";
    parts.forEach(function (p, i) {
      if (i < labels.length) {
        fieldHtml += '<div class="cron-field"><div class="val">' + p + '</div><div class="lbl">' + labels[i] + '</div></div>';
      }
    });

    // Calculate next 5 fires (simple approximation for display)
    var nextFires = computeNextFires(expr, 5);
    var firesHtml = "";
    if (nextFires.length) {
      firesHtml = '<div style="margin-top:0.3rem;font-size:0.68rem;color:var(--text-tertiary);">Next fires:</div><ul class="next-fires">';
      nextFires.forEach(function (d) {
        firesHtml += '<li>' + d.toLocaleString() + '</li>';
      });
      firesHtml += '</ul>';
    }

    container.innerHTML = '<div class="cron-helper"><div class="cron-fields">' + fieldHtml + '</div>' + firesHtml + '</div>';
  }

  // Simple next-fire calculator (handles basic patterns)
  function computeNextFires(expr, count) {
    if (expr.startsWith("@") || !CRON_RE.test(expr)) return [];
    var parts = expr.split(/\s+/);
    if (parts.length < 5) return [];

    var minute = parts[0], hour = parts[1];
    var results = [];
    var now = new Date();

    // Only handle simple numeric minute/hour for preview
    var m = minute === "*" ? null : parseInt(minute);
    var h = hour === "*" ? null : parseInt(hour);
    if ((m !== null && isNaN(m)) || (h !== null && isNaN(h))) return [];

    var cursor = new Date(now);
    cursor.setSeconds(0);
    cursor.setMilliseconds(0);

    for (var tries = 0; tries < 1440 * 7 && results.length < count; tries++) {
      cursor = new Date(cursor.getTime() + 60000);
      var cm = cursor.getMinutes();
      var ch = cursor.getHours();
      if ((m === null || cm === m) && (h === null || ch === h)) {
        results.push(new Date(cursor));
      }
    }

    return results;
  }

  // ── Run History ─────────────────────────────────────────

  function showRunHistory(ctx, job, container) {
    ctx.showLoading(container);
    var jobId = job.id || job.name;
    PinchyAPI.getCronJobRuns(jobId).then(function (data) {
      var runs = data.runs || [];
      if (!runs.length) {
        container.innerHTML = '<div class="card-static"><h3 style="color:var(--accent);font-size:0.88rem;">Run History: ' + ctx.escapeHtml(job.name) + '</h3><p class="placeholder">No runs recorded</p></div>';
        return;
      }
      var html = '<div class="card-static"><h3 style="color:var(--accent);font-size:0.88rem;margin-bottom:0.5rem;">Run History: ' + ctx.escapeHtml(job.name) + '</h3>';
      html += '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Status</th><th>Duration</th><th>Output</th></tr></thead><tbody>';
      runs.forEach(function (r) {
        var time = r.executed_at ? new Date(r.executed_at * 1000).toLocaleString() : "—";
        var status = r.status || "UNKNOWN";
        var dur = r.duration_ms != null ? r.duration_ms + "ms" : "—";
        var output = r.output_preview || r.error || "—";
        html += '<tr><td>' + time + '</td><td><span class="badge badge-' + badgeClass(status.toLowerCase().replace(/^failed.*/, "failed")) + '">' + ctx.escapeHtml(status) + '</span></td><td>' + dur + '</td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">' + ctx.escapeHtml(output) + '</td></tr>';
      });
      html += '</tbody></table></div></div>';
      container.innerHTML = html;
    }).catch(function () {
      ctx.showError(container, "Failed to load run history");
    });
  }
})();
