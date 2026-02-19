// Pinchy Views — Dashboard
(function () {
  "use strict";
  window.PinchyViews = window.PinchyViews || {};

  window.PinchyViews.dashboard = {
    init: function (ctx) {
      var container = ctx.container;
      var events = ctx.state.events.slice(-50);
      var activeFilter = "all";
      var timelineUl;

      container.innerHTML =
        '<div class="stat-row" id="dash-stats"></div>' +
        '<section>' +
          '<div class="section-header"><h2>Heartbeat Status</h2></div>' +
          '<div class="grid-3" id="dash-heartbeat"></div>' +
        '</section>' +
        '<section>' +
          '<div class="section-header">' +
            '<h2>Recent Events</h2>' +
            '<div id="dash-filters" style="display:flex;gap:0.3rem;"></div>' +
          '</div>' +
          '<ul class="timeline" id="dash-timeline"></ul>' +
        '</section>';

      var statsEl = document.getElementById("dash-stats");
      var hbEl = document.getElementById("dash-heartbeat");
      ctx.showLoading(hbEl);
      timelineUl = document.getElementById("dash-timeline");
      var filtersEl = document.getElementById("dash-filters");

      // Stat cards
      function renderStats(agentCount, sessionCount, cronCount, tokenCount) {
        var wsStatus = ctx.state.wsConnected ? '●' : '○';
        var wsColor = ctx.state.wsConnected ? 'var(--success)' : 'var(--error)';
        var tkLabel = typeof tokenCount === "number" ? tokenCount.toLocaleString() : "0";
        statsEl.innerHTML =
          statCard(agentCount, "Agents") +
          statCard(sessionCount, "Sessions") +
          statCard(cronCount, "Cron Jobs") +
          statCard(tkLabel, "Tokens") +
          '<div class="stat-card"><span class="stat-value" style="color:' + wsColor + '">' + wsStatus + '</span><span class="stat-label">WebSocket</span></div>';
      }

      function statCard(value, label) {
        return '<div class="stat-card"><span class="stat-value">' + value + '</span><span class="stat-label">' + ctx.escapeHtml(label) + '</span></div>';
      }

      // Heartbeat
      function loadHeartbeat() {
        PinchyAPI.getHeartbeat().then(function (data) {
          var agents = data.agents || [];
          if (!agents.length) {
            hbEl.innerHTML = '<div class="placeholder">No agents with heartbeat enabled</div>';
            return;
          }
          hbEl.innerHTML = "";
          agents.forEach(function (a) {
            var health = (a.health || "UNKNOWN").toUpperCase().replace(/^ERROR:?\s*/i, "ERROR");
            var cls = health === "OK" ? "badge-ok" : health === "MISSED" ? "badge-missed" : "badge-error";
            var label = health.startsWith("ERROR") ? "ERROR" : health;
            var last = a.last_tick ? new Date(a.last_tick * 1000).toLocaleTimeString() : "N/A";
            var next = a.next_tick ? new Date(a.next_tick * 1000).toLocaleTimeString() : "N/A";
            var interval = a.interval_secs != null ? a.interval_secs + "s" : "—";
            var card = document.createElement("div");
            card.className = "hb-card";
            card.innerHTML =
              '<h3><span class="badge ' + cls + '">' + ctx.escapeHtml(label) + '</span> ' + ctx.escapeHtml(a.agent_id || "unknown") + '</h3>' +
              '<p class="hb-meta">Last: ' + last + ' · Next: ' + next + '</p>' +
              '<p class="hb-meta">Interval: ' + interval + '</p>' +
              '<div style="margin-top:0.4rem"><button class="btn btn-sm btn-secondary" data-agent="' + ctx.escapeHtml(a.agent_id) + '">Force Tick</button></div>';
            card.querySelector("button").addEventListener("click", function () {
              ctx.sendCommand("/heartbeat check " + a.agent_id);
              ctx.showToast("Forced heartbeat tick for " + a.agent_id, "info");
            });
            hbEl.appendChild(card);
          });
        }).catch(function () {
          ctx.showErrorWithRetry(hbEl, "Failed to load heartbeat data", loadHeartbeat);
        });
      }

      // Filters
      var filterTypes = ["all", "heartbeat", "cron", "discord", "session"];
      filterTypes.forEach(function (f) {
        var btn = document.createElement("button");
        btn.className = "btn btn-sm " + (f === "all" ? "btn-primary" : "btn-ghost");
        btn.textContent = f.charAt(0).toUpperCase() + f.slice(1);
        btn.style.fontSize = "0.72rem";
        btn.addEventListener("click", function () {
          activeFilter = f;
          filtersEl.querySelectorAll("button").forEach(function (b) {
            b.className = "btn btn-sm " + (b.textContent.toLowerCase() === f ? "btn-primary" : "btn-ghost");
          });
          applyFilter();
        });
        filtersEl.appendChild(btn);
      });

      function applyFilter() {
        timelineUl.querySelectorAll("li").forEach(function (li) {
          if (activeFilter === "all") { li.style.display = ""; return; }
          li.style.display = li.dataset.type === activeFilter ? "" : "none";
        });
      }

      // Timeline
      function addTimelineEvent(data) {
        var li = document.createElement("li");
        var evType = (data.type || "unknown").toLowerCase();
        li.dataset.type = evType;

        var ts = document.createElement("span");
        ts.className = "ts";
        var d = data.timestamp ? new Date(data.timestamp) : new Date();
        ts.textContent = d.toLocaleTimeString();

        var typeSp = document.createElement("span");
        typeSp.className = "ev-type " + evType;
        typeSp.textContent = evType;

        var agentSp = document.createElement("span");
        agentSp.className = "ev-agent";
        agentSp.textContent = data.agent || data.agent_id || "";

        var contentSp = document.createElement("span");
        contentSp.className = "ev-content";
        var raw = data.content || data.message || data.command || data.response || data.output_preview || "";
        if (evType === "session_message" && data.role) raw = data.role + ": " + raw;
        contentSp.textContent = typeof raw === "string" ? raw.slice(0, 200) : JSON.stringify(raw).slice(0, 200);

        li.append(ts, typeSp, agentSp, contentSp);

        if (activeFilter !== "all" && evType !== activeFilter) li.style.display = "none";

        timelineUl.appendChild(li);
        while (timelineUl.children.length > 100) timelineUl.removeChild(timelineUl.firstChild);
        timelineUl.scrollTop = timelineUl.scrollHeight;
      }

      // Render existing events
      events.forEach(addTimelineEvent);

      // Load data
      var agentCount = ctx.state.agents.length || 0;
      var sessionCount = "—";

      var tokenCount = 0;

      PinchyAPI.listAgents().then(function (data) {
        var agents = data.agents || [];
        agentCount = agents.length;
        return Promise.all(agents.map(function (a) {
          return PinchyAPI.listSessions(a.id).then(function (d) {
            return (d.sessions || []).length;
          }).catch(function () { return 0; });
        })).then(function (counts) {
          sessionCount = counts.reduce(function (sum, n) { return sum + n; }, 0);
          // Fetch most recent receipt file per agent to sum tokens
          return Promise.all(agents.map(function (a) {
            return PinchyAPI.listReceipts(a.id).then(function (r) {
              var files = r.receipts || r.files || r || [];
              if (!Array.isArray(files) || files.length === 0) return 0;
              var latest = files[files.length - 1];
              var fileId = typeof latest === "string" ? latest : (latest.file || latest.session_id || latest.id);
              if (!fileId) return 0;
              return PinchyAPI.getReceipts(a.id, fileId).then(function (entries) {
                if (!Array.isArray(entries)) entries = entries.entries || [];
                return entries.reduce(function (sum, e) {
                  return sum + ((e.tokens && e.tokens.total_tokens) || 0);
                }, 0);
              });
            }).catch(function () { return 0; });
          }));
        }).then(function (tokenCounts) {
          tokenCount = tokenCounts.reduce(function (sum, n) { return sum + n; }, 0);
        });
      }).catch(function () {}).then(function () {
        PinchyAPI.listCronJobs().then(function (data) {
          var cronCount = (data.jobs || []).length;
          renderStats(agentCount, sessionCount, cronCount, tokenCount);
        }).catch(function () {
          renderStats(agentCount, sessionCount, "—", tokenCount);
        });
      });

      loadHeartbeat();

      return {
        onEvent: function (data) {
          addTimelineEvent(data);
          // Refresh heartbeat on heartbeat events
          var lt = (data.type || "").toLowerCase();
          if (lt === "heartbeat" || lt === "heartbeat_event") loadHeartbeat();
        },
        refresh: function () {
          loadHeartbeat();
        },
        destroy: function () {},
      };
    }
  };
})();
