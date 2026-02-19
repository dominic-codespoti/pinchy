// Pinchy Views — Logs (live log viewer)
(function () {
  "use strict";
  window.PinchyViews = window.PinchyViews || {};

  var LEVEL_ORDER = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 };
  var MAX_LINES = 2000;

  window.PinchyViews.logs = {
    init: function (ctx) {
      var container = ctx.container;
      var paused = false;
      var pending = [];
      var logWs = null;

      container.innerHTML =
        '<div class="section-header"><h2>Live Logs</h2></div>' +
        '<div class="log-controls">' +
          '<label style="font-size:0.75rem;color:var(--text-secondary);">Level:</label>' +
          '<select id="log-level">' +
            '<option value="TRACE">TRACE</option>' +
            '<option value="DEBUG">DEBUG</option>' +
            '<option value="INFO" selected>INFO</option>' +
            '<option value="WARN">WARN</option>' +
            '<option value="ERROR">ERROR</option>' +
          '</select>' +
          '<label style="font-size:0.75rem;color:var(--text-secondary);">Filter:</label>' +
          '<input type="text" id="log-filter" placeholder="text search…" autocomplete="off">' +
          '<label style="font-size:0.75rem;color:var(--text-secondary);">Agent:</label>' +
          '<input type="text" id="log-agent-filter" placeholder="agent id…" autocomplete="off" style="max-width:120px;">' +
          '<button class="btn btn-sm btn-secondary" id="log-pause">Pause</button>' +
          '<button class="btn btn-sm btn-secondary" id="log-clear">Clear</button>' +
        '</div>' +
        '<ul class="log-lines" id="log-lines"></ul>' +
        '<div id="log-count" style="font-size:0.72rem;color:var(--text-tertiary);text-align:right;padding:0 0 0.25rem;"></div>';

      var logList = document.getElementById("log-lines");
      var levelSel = document.getElementById("log-level");
      var textFilter = document.getElementById("log-filter");
      var agentFilter = document.getElementById("log-agent-filter");
      var btnPause = document.getElementById("log-pause");
      var btnClear = document.getElementById("log-clear");
      var countEl = document.getElementById("log-count");

      // Make log-lines fill available space
      logList.style.height = "calc(100vh - 320px)";
      logList.style.overflowY = "auto";

      function levelNum(lvl) { return LEVEL_ORDER[(lvl || "").toUpperCase()] || 2; }

      function matchesFilters(entry) {
        if (levelNum(entry.level) < levelNum(levelSel.value)) return false;
        var q = textFilter.value.toLowerCase();
        if (q && !(entry.message || "").toLowerCase().includes(q) &&
            !(entry.target || "").toLowerCase().includes(q)) return false;
        var af = agentFilter.value.toLowerCase();
        if (af && !(entry.target || "").toLowerCase().includes(af)) return false;
        return true;
      }

      function updateCount() {
        var n = logList.children.length;
        countEl.textContent = n + " line" + (n !== 1 ? "s" : "");
      }

      function renderLine(entry) {
        var li = document.createElement("li");
        li.dataset.level = (entry.level || "INFO").toUpperCase();

        var ts = document.createElement("span");
        ts.className = "log-ts";
        ts.textContent = (entry.ts || new Date().toISOString()).slice(11, 23);
        ts.title = entry.ts || "";

        var lvl = document.createElement("span");
        var lvlStr = (entry.level || "INFO").toUpperCase();
        lvl.className = "log-lvl " + lvlStr.toLowerCase();
        lvl.textContent = lvlStr;

        var tgt = document.createElement("span");
        tgt.className = "log-tgt";
        tgt.textContent = entry.target || "";

        var msg = document.createElement("span");
        msg.className = "log-msg";
        msg.textContent = entry.message || "";

        li.append(ts, lvl, tgt, msg);
        if (!matchesFilters(entry)) li.style.display = "none";

        logList.appendChild(li);
        while (logList.children.length > MAX_LINES) logList.removeChild(logList.firstChild);
        updateCount();

        // Auto-scroll
        if (logList.scrollHeight - logList.scrollTop - logList.clientHeight < 80) {
          logList.scrollTop = logList.scrollHeight;
        }
      }

      function refilter() {
        var items = logList.querySelectorAll("li");
        items.forEach(function (li) {
          var lvl = li.dataset.level || "INFO";
          var show = levelNum(lvl) >= levelNum(levelSel.value);
          var q = textFilter.value.toLowerCase();
          var af = agentFilter.value.toLowerCase();
          var text = li.textContent.toLowerCase();
          li.style.display = (show && (!q || text.includes(q)) && (!af || text.includes(af))) ? "" : "none";
        });
      }

      levelSel.addEventListener("change", refilter);
      textFilter.addEventListener("input", refilter);
      agentFilter.addEventListener("input", refilter);

      btnPause.addEventListener("click", function () {
        paused = !paused;
        btnPause.textContent = paused ? "Resume" : "Pause";
        btnPause.classList.toggle("btn-primary", paused);
        btnPause.classList.toggle("btn-secondary", !paused);
        if (!paused) {
          pending.forEach(renderLine);
          pending = [];
        }
      });

      btnClear.addEventListener("click", function () {
        logList.innerHTML = "";
        updateCount();
      });

      // Connect to log WebSocket
      function connectLogs() {
        logWs = PinchyAPI.streamLogs(
          function onMessage(entry) {
            if (paused) {
              if (pending.length < MAX_LINES) pending.push(entry);
              return;
            }
            renderLine(entry);
          },
          null,
          function onClose() {
            // Reconnect after delay
            setTimeout(function () {
              if (container.isConnected) connectLogs();
            }, 2000);
          }
        );
      }

      connectLogs();

      return {
        refresh: function () {},
        destroy: function () {
          if (logWs) { logWs.close(); logWs = null; }
        },
      };
    }
  };
})();
