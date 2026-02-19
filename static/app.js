// Pinchy SPA — Router, WebSocket, shared state
(function () {
  "use strict";

  // ========================================
  // Shared state
  // ========================================
  var state = {
    agents: [],
    ws: null,
    wsConnected: false,
    events: [],
    currentView: null,
    currentRoute: "",
  };

  var MAX_EVENTS = 200;
  var backoff = 500;
  var refreshTimer = null;

  // DOM refs
  var mainEl = document.getElementById("main");
  var wsDot = document.getElementById("ws-dot");
  var wsLabel = document.getElementById("ws-label");
  var agentSelect = document.getElementById("agent-select");
  var btnRefresh = document.getElementById("btn-refresh");
  var btnHamburger = document.getElementById("btn-hamburger");
  var sidebar = document.getElementById("sidebar");
  var toastContainer = document.getElementById("toast-container");

  // ========================================
  // Utilities
  // ========================================
  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function showToast(message, type) {
    type = type || "info";
    var el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(function () {
      el.classList.add("fade-out");
      setTimeout(function () { el.remove(); }, 350);
    }, 3500);
  }

  function showLoading(container) {
    container.innerHTML = '<div class="loading">Loading…</div>';
  }

  function showError(container, msg) {
    container.innerHTML = '<div class="placeholder">' + escapeHtml(msg) + '</div>';
  }

  function showErrorWithRetry(container, msg, retryFn) {
    container.innerHTML = '<div class="placeholder">' + escapeHtml(msg) +
      ' <button class="btn btn-sm btn-secondary" style="margin-left:0.5rem;">Retry</button></div>';
    container.querySelector("button").addEventListener("click", function() {
      showLoading(container);
      retryFn();
    });
  }

  // ========================================
  // Agent select sync
  // ========================================
  function updateAgents(agents) {
    state.agents = agents;
    var current = agentSelect.value;
    agentSelect.innerHTML = "";
    agents.forEach(function (a) {
      var opt = document.createElement("option");
      opt.value = a;
      opt.textContent = a;
      agentSelect.appendChild(opt);
    });
    if (agents.includes(current)) agentSelect.value = current;
  }

  // ========================================
  // WebSocket
  // ========================================
  function connectWS() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var url = proto + "//" + location.host + "/ws";
    var ws = new WebSocket(url);
    state.ws = ws;

    ws.onopen = function () {
      state.wsConnected = true;
      wsDot.className = "status-dot ok";
      wsLabel.textContent = "connected";
      backoff = 500;
    };

    ws.onclose = function () {
      state.wsConnected = false;
      wsDot.className = "status-dot err";
      wsLabel.textContent = "disconnected";
      state.ws = null;
      setTimeout(connectWS, Math.min(backoff, 15000));
      backoff = Math.min(backoff * 2, 15000);
    };

    ws.onerror = function () { ws.close(); };

    ws.onmessage = function (ev) {
      try {
        var data = JSON.parse(ev.data);
      } catch (_) { return; }

      // Shutdown
      if (data.type === "shutdown") {
        showToast("Server shutting down…", "error");
      }

      // Agent list
      if (data.type === "agent_list" || data.type === "list_agents" || data.type === "session_list") {
        if (Array.isArray(data.agents)) updateAgents(data.agents);
      }

      // Store event
      state.events.push(data);
      if (state.events.length > MAX_EVENTS) state.events = state.events.slice(-MAX_EVENTS);

      // Notify current view
      if (state.currentView && state.currentView.onEvent) {
        state.currentView.onEvent(data);
      }
    };
  }

  function sendCommand(text, targetAgent) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      showToast("Not connected", "error");
      return;
    }
    var payload = JSON.stringify({
      type: "client_command",
      command: text,
      target_agent: targetAgent || agentSelect.value || "default",
    });
    state.ws.send(payload);
  }

  // ========================================
  // Router
  // ========================================
  var routes = {
    dashboard: window.PinchyViews && window.PinchyViews.dashboard,
    agents:    window.PinchyViews && window.PinchyViews.agents,
    config:    window.PinchyViews && window.PinchyViews.config,
    sessions:  window.PinchyViews && window.PinchyViews.sessions,
    cron:      window.PinchyViews && window.PinchyViews.cron,
    logs:      window.PinchyViews && window.PinchyViews.logs,
    chat:      window.PinchyViews && window.PinchyViews.chat,
    skills:    window.PinchyViews && window.PinchyViews.skills,
  };

  function parseHash() {
    var hash = location.hash || "#/chat";
    // Remove leading #/
    var path = hash.replace(/^#\/?/, "");
    var parts = path.split("/");
    return { name: parts[0] || "chat", params: parts.slice(1) };
  }

  function navigate() {
    var route = parseHash();
    var viewName = route.name;
    var params = route.params;

    // Destroy current view
    if (state.currentView && state.currentView.destroy) {
      state.currentView.destroy();
    }
    state.currentView = null;
    state.currentRoute = viewName;

    // Update sidebar active state
    sidebar.querySelectorAll("a").forEach(function (a) {
      var r = a.getAttribute("data-route");
      a.classList.toggle("active", r === viewName);
    });

    // Close mobile sidebar
    sidebar.classList.remove("open");

    // Get view module
    var viewModule = routes[viewName];
    if (!viewModule) {
      mainEl.innerHTML = '<div class="placeholder">Page not found: ' + escapeHtml(viewName) + '</div>';
      return;
    }

    // Init view
    mainEl.innerHTML = "";
    var ctx = {
      container: mainEl,
      params: params,
      state: state,
      sendCommand: sendCommand,
      showToast: showToast,
      showLoading: showLoading,
      showError: showError,
      showErrorWithRetry: showErrorWithRetry,
      escapeHtml: escapeHtml,
      navigate: function (hash) { location.hash = hash; },
    };

    var view = viewModule.init(ctx);
    state.currentView = view || {};
  }

  window.addEventListener("hashchange", navigate);

  // ========================================
  // Hamburger
  // ========================================
  btnHamburger.addEventListener("click", function () {
    sidebar.classList.toggle("open");
  });

  // ========================================
  // Refresh button
  // ========================================
  btnRefresh.addEventListener("click", function () {
    if (state.currentView && state.currentView.refresh) {
      state.currentView.refresh();
    } else {
      navigate();
    }
  });

  // ========================================
  // Boot
  // ========================================

  // Re-resolve routes after all scripts have loaded
  function resolveRoutes() {
    if (window.PinchyViews) {
      routes.dashboard = window.PinchyViews.dashboard;
      routes.agents    = window.PinchyViews.agents;
      routes.config    = window.PinchyViews.config;
      routes.sessions  = window.PinchyViews.sessions;
      routes.cron      = window.PinchyViews.cron;
      routes.logs      = window.PinchyViews.logs;
      routes.chat      = window.PinchyViews.chat;
      routes.skills    = window.PinchyViews.skills;
    }
    // Retry once shortly in case scripts load after this script.
    setTimeout(function () {
      if (window.PinchyViews) {
        routes.dashboard = window.PinchyViews.dashboard || routes.dashboard;
        routes.agents    = window.PinchyViews.agents    || routes.agents;
        routes.config    = window.PinchyViews.config    || routes.config;
        routes.sessions  = window.PinchyViews.sessions  || routes.sessions;
        routes.cron      = window.PinchyViews.cron      || routes.cron;
        routes.logs      = window.PinchyViews.logs      || routes.logs;
        routes.chat      = window.PinchyViews.chat      || routes.chat;
        routes.skills    = window.PinchyViews.skills    || routes.skills;
      }
    }, 250);
  }

  resolveRoutes();
  connectWS();

  // Redirect to #/chat if no hash
  if (!location.hash || location.hash === "#" || location.hash === "#/") {
    location.hash = "#/chat";
  }

  navigate();

  // Expose for views
  window.Pinchy = {
    state: state,
    sendCommand: sendCommand,
    showToast: showToast,
    escapeHtml: escapeHtml,
    updateAgents: updateAgents,
  };
})();
