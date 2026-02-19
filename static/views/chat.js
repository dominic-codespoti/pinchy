// Pinchy Views — Chat (real-time agent conversation)
(function () {
  "use strict";
  window.PinchyViews = window.PinchyViews || {};

  // ── Tiny Markdown renderer (no deps) ────────────────────────
  function renderMarkdown(src) {
    if (!src) return "";
    // Escape HTML first
    var h = src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Fenced code blocks: ```lang\n...\n```
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, function (_, lang, code) {
      var cls = lang ? ' class="lang-' + lang + '"' : '';
      return '<pre><code' + cls + '>' + code.replace(/\n$/, '') + '</code></pre>';
    });

    // Inline code
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Bold / italic
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Headings (### before ## before #)
    h = h.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    h = h.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^# (.+)$/gm, '<h2>$1</h2>');

    // Unordered lists (- item)
    h = h.replace(/(^|\n)(- .+(?:\n- .+)*)/g, function (_, pre, block) {
      var items = block.split('\n').map(function (line) {
        return '<li>' + line.replace(/^- /, '') + '</li>';
      }).join('');
      return pre + '<ul>' + items + '</ul>';
    });

    // Ordered lists (1. item)
    h = h.replace(/(^|\n)(\d+\. .+(?:\n\d+\. .+)*)/g, function (_, pre, block) {
      var items = block.split('\n').map(function (line) {
        return '<li>' + line.replace(/^\d+\.\s*/, '') + '</li>';
      }).join('');
      return pre + '<ol>' + items + '</ol>';
    });

    // Links [text](url)
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Horizontal rules
    h = h.replace(/^---$/gm, '<hr>');

    // Line breaks: convert remaining newlines to <br> (but not inside <pre>)
    // Split by <pre>...</pre> to protect code blocks
    var parts = h.split(/(<pre>[\s\S]*?<\/pre>)/);
    h = parts.map(function (part) {
      if (part.indexOf('<pre>') === 0) return part;
      return part.replace(/\n/g, '<br>');
    }).join('');

    return h;
  }

  window.PinchyViews.chat = {
    init: function (ctx) {
      var container = ctx.container;
      var chatAgent = ctx.state.agents[0] || "default";
      var currentSessionId = null;    // session being VIEWED in the chat
      var activeServerSession = null; // session the SERVER is currently running

      container.innerHTML =
        '<div class="chat-wrapper">' +
          '<div class="chat-header">' +
            '<a href="#/dashboard" class="chat-nav-link" title="Back to dashboard">◁ Dashboard</a>' +
            '<span style="flex:1;"></span>' +
            '<button class="chat-toggle-activity" id="chat-toggle-activity" title="Show/hide tool calls and receipts">⚡ Activity</button>' +
            '<select id="chat-session" class="chat-agent-select" title="Switch session"></select>' +
            '<select id="chat-agent" class="chat-agent-select" title="Switch agent"></select>' +
          '</div>' +
          '<div id="chat-other-session-banner" class="chat-other-session-banner" style="display:none;">' +
            '<span class="other-session-dots"><span></span><span></span><span></span></span>' +
            '<span id="chat-other-session-label">Agent is working in another session</span>' +
            '<button class="btn btn-sm btn-secondary" id="chat-jump-session">Jump to it</button>' +
          '</div>' +
          '<div class="chat-messages" id="chat-messages"></div>' +
          '<div class="typing-indicator" id="typing-indicator">' +
            '<div class="typing-dots"><span></span><span></span><span></span></div>' +
            '<span id="typing-label">Thinking…</span>' +
          '</div>' +
          '<div class="chat-input-bar">' +
            '<textarea id="chat-input" rows="1" placeholder="Message (↵ to send, Shift+↵ for line breaks)" autocomplete="off"></textarea>' +
            '<button class="btn btn-secondary" id="chat-new-session">New session</button>' +
            '<button class="btn btn-send" id="chat-send">Send <span class="send-icon">↗</span></button>' +
          '</div>' +
        '</div>';

      var agentSel = document.getElementById("chat-agent");
      var sessionSel = document.getElementById("chat-session");
      var msgsEl = document.getElementById("chat-messages");
      var inputEl = document.getElementById("chat-input");
      var btnSend = document.getElementById("chat-send");
      var btnNewSession = document.getElementById("chat-new-session");
      var typingEl = document.getElementById("typing-indicator");
      var typingLabel = document.getElementById("typing-label");
      var btnToggleActivity = document.getElementById("chat-toggle-activity");
      var otherSessionBanner = document.getElementById("chat-other-session-banner");
      var otherSessionLabel = document.getElementById("chat-other-session-label");
      var btnJumpSession = document.getElementById("chat-jump-session");

      // Activity toggle state (persisted in sessionStorage)
      var showActivity = sessionStorage.getItem("pinchy-show-activity") === "1";
      if (showActivity) btnToggleActivity.classList.add("active");

      btnToggleActivity.addEventListener("click", function () {
        showActivity = !showActivity;
        btnToggleActivity.classList.toggle("active", showActivity);
        sessionStorage.setItem("pinchy-show-activity", showActivity ? "1" : "0");
        msgsEl.querySelectorAll(".chat-tool-activity, .chat-receipt").forEach(function (el) {
          if (showActivity) { el.classList.add("visible"); } else { el.classList.remove("visible"); }
        });
      });

      // ── Populate agent dropdown via REST ──────────────────────
      function populateAgents(agents) {
        var prev = agentSel.value || chatAgent;
        agentSel.innerHTML = "";
        agents.forEach(function (a) {
          var opt = document.createElement("option");
          opt.value = a;
          opt.textContent = a;
          agentSel.appendChild(opt);
        });
        if (agents.indexOf(prev) !== -1) agentSel.value = prev;
        else if (agents.length) agentSel.value = agents[0];
        chatAgent = agentSel.value || "default";
      }

      // Seed from state (may be populated already), then fetch fresh
      if (ctx.state.agents.length) {
        populateAgents(ctx.state.agents);
      } else {
        // Fallback: add "default" so dropdown isn't empty while loading
        populateAgents(["default"]);
      }
      PinchyAPI.listAgents().then(function (data) {
        var agents = (data.agents || []).map(function (a) {
          return typeof a === "string" ? a : (a.id || a.name || "default");
        });
        if (agents.length) populateAgents(agents);
      }).catch(function () {});

      // ── Populate session dropdown ─────────────────────────────
      function populateSessions(sessions, activeId) {
        sessionSel.innerHTML = "";
        sessions.forEach(function (s) {
          var opt = document.createElement("option");
          opt.value = s.session_id;
          var label = s.session_id;
          if (label.length > 20) label = label.slice(0, 18) + "…";
          if (s.modified) {
            var d = new Date(s.modified * 1000);
            label += " · " + d.toLocaleDateString();
          }
          opt.textContent = label;
          if (s.session_id === activeId) opt.selected = true;
          sessionSel.appendChild(opt);
        });
        currentSessionId = activeId || (sessions.length ? sessions[0].session_id : null);
      }

      function loadSessionList() {
        return PinchyAPI.listSessions(chatAgent).then(function (data) {
          var sessions = (data.sessions || []).filter(function (s) {
            return s.file && !s.file.endsWith(".receipts.jsonl");
          });
          sessions.sort(function (a, b) { return (b.modified || 0) - (a.modified || 0); });
          return PinchyAPI.getCurrentSession(chatAgent).then(function (cur) {
            var activeId = cur && cur.session_id ? cur.session_id : (sessions.length ? sessions[0].session_id : null);
            activeServerSession = activeId;
            populateSessions(sessions, activeId);
            return activeId;
          });
        }).catch(function () { return null; });
      }

      // Make chat fill available space
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.gap = "0";
      container.style.padding = "0";
      container.style.alignItems = "center";

      // Mark chat-active for layout tweaks (sidebar stays visible)
      var shell = document.querySelector(".shell");
      if (shell) shell.classList.add("chat-active");

      // Track seen message signatures for dedup (REST load vs WS replay)
      var seenMessages = {};
      var pendingDedup = {};
      function msgKey(role, content, ts) {
        return (role || "") + "|" + (content || "").slice(0, 120) + "|" + (ts || "");
      }
      function contentKey(role, content) {
        return (role || "") + "|" + (content || "").slice(0, 120);
      }

      agentSel.addEventListener("change", function () {
        chatAgent = agentSel.value;
        var globalSel = document.getElementById("agent-select");
        if (globalSel) globalSel.value = chatAgent;
        hideOtherSessionBanner();
        loadSessionList().then(function (sid) {
          if (sid) loadSession(sid);
        });
      });

      sessionSel.addEventListener("change", function () {
        var sid = sessionSel.value;
        if (sid && sid !== currentSessionId) {
          loadSession(sid);
        }
      });

      btnNewSession.addEventListener("click", function () {
        ctx.sendCommand("/new", chatAgent);
        addSystemMessage("New session started");
        hideOtherSessionBanner();
        setTimeout(function () {
          loadSessionList();
        }, 1000);
      });

      // ── Other-session banner ──────────────────────────────────
      var otherSessionTimer = null;

      function showOtherSessionBanner(sessionId, detail) {
        var label = sessionId || "another session";
        if (label.length > 30) label = label.slice(0, 28) + "…";
        otherSessionLabel.textContent = "Agent is working in: " + label + (detail ? " — " + detail : "");
        otherSessionBanner.style.display = "";
        // Auto-hide after 30s of inactivity
        clearTimeout(otherSessionTimer);
        otherSessionTimer = setTimeout(hideOtherSessionBanner, 30000);
      }

      function hideOtherSessionBanner() {
        otherSessionBanner.style.display = "none";
        clearTimeout(otherSessionTimer);
      }

      btnJumpSession.addEventListener("click", function () {
        if (!activeServerSession) return;
        // Select that session in dropdown (if present) and load it
        hideOtherSessionBanner();
        // Refresh session list first in case it's a brand new session
        loadSessionList().then(function () {
          if (activeServerSession) {
            sessionSel.value = activeServerSession;
            loadSession(activeServerSession);
          }
        });
      });

      function setTyping(active, label) {
        if (active) {
          typingLabel.textContent = label || "Thinking…";
          typingEl.classList.add("visible");
          msgsEl.scrollTop = msgsEl.scrollHeight;
        } else {
          typingEl.classList.remove("visible");
        }
      }

      function sendMessage() {
        var text = inputEl.value.trim();
        if (!text) return;
        ctx.sendCommand(text, chatAgent);
        addUserMessage(text);
        // Track for dedup against session_message echo (no ts match needed)
        pendingDedup[contentKey("user", text)] = Date.now();
        inputEl.value = "";
        inputEl.style.height = "auto";
        setTyping(true, "Thinking…");
      }

      btnSend.addEventListener("click", sendMessage);
      inputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      inputEl.addEventListener("input", function () {
        // Auto-resize textarea
        inputEl.style.height = "auto";
        inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + "px";
      });
      inputEl.focus();

      function addUserMessage(text, timestamp) {
        var div = document.createElement("div");
        div.className = "chat-msg user";
        div.innerHTML = '<div class="msg-role">you</div>';
        var contentEl = document.createElement("div");
        contentEl.textContent = text;
        div.appendChild(contentEl);
        var tsEl = document.createElement("div");
        tsEl.className = "msg-ts";
        if (timestamp) {
          var d = typeof timestamp === "number"
            ? new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp)
            : new Date(timestamp);
          var age = Date.now() - d.getTime();
          tsEl.textContent = age > 300000 ? relativeTime(d) : d.toLocaleTimeString();
        } else {
          tsEl.textContent = new Date().toLocaleTimeString();
        }
        div.appendChild(tsEl);
        msgsEl.appendChild(div);
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }

      function relativeTime(date) {
        var now = Date.now();
        var diff = Math.max(0, now - date.getTime());
        var secs = Math.floor(diff / 1000);
        if (secs < 60) return "just now";
        var mins = Math.floor(secs / 60);
        if (mins < 60) return mins + "m ago";
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + "h ago";
        var days = Math.floor(hrs / 24);
        if (days < 7) return days + "d ago";
        return date.toLocaleDateString();
      }

      function addSystemMessage(text) {
        var div = document.createElement("div");
        div.className = "chat-msg system";
        div.textContent = text;
        msgsEl.appendChild(div);
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }

      function addAssistantMessage(data) {
        var role = data.role || "assistant";
        var content = data.content || data.response || data.message || "";
        var isTool = role === "tool_call" || role === "tool_result" || role === "tool";

        var div = document.createElement("div");
        div.className = "chat-msg " + (isTool ? "tool" : role);

        var roleEl = document.createElement("div");
        roleEl.className = "msg-role";

        if (isTool) {
          var toolName = data.tool_name || data.name || "tool";
          roleEl.innerHTML = (role === "tool_call" ? "⚡ " : "✓ ") + role + ": " + ctx.escapeHtml(toolName) +
            ' <span style="font-size:0.65rem;color:var(--text-tertiary);margin-left:0.5rem;">▸ click to expand</span>';

          var bodyEl = document.createElement("div");
          bodyEl.className = "tool-body";
          bodyEl.style.display = "none";

          var pre = document.createElement("pre");
          if (role === "tool_call") {
            pre.textContent = typeof data.input === "string" ? data.input : JSON.stringify(data.input || content, null, 2);
          } else {
            pre.textContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
          }
          bodyEl.appendChild(pre);
          div.appendChild(roleEl);
          div.appendChild(bodyEl);

          div.addEventListener("click", function () {
            bodyEl.style.display = bodyEl.style.display === "none" ? "" : "none";
          });
        } else {
          roleEl.textContent = role;
          div.appendChild(roleEl);

          var contentDiv = document.createElement("div");
          contentDiv.className = "msg-content md-body";
          var raw = typeof content === "string" ? content : JSON.stringify(content);
          contentDiv.innerHTML = renderMarkdown(raw);
          div.appendChild(contentDiv);
        }

        if (data.timestamp) {
          var tsEl = document.createElement("div");
          tsEl.className = "msg-ts";
          var d = typeof data.timestamp === "number"
            ? new Date(data.timestamp < 1e12 ? data.timestamp * 1000 : data.timestamp)
            : new Date(data.timestamp);
          // Use relative time for history messages older than 5 minutes
          var age = Date.now() - d.getTime();
          tsEl.textContent = age > 300000 ? relativeTime(d) : d.toLocaleTimeString();
          div.appendChild(tsEl);
        }

        msgsEl.appendChild(div);
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }

      // Seed seen-set from WS replay events (for dedup only — don't render)
      var sessionEvents = ctx.state.events.filter(function (e) {
        return e.type === "session_message" && (e.agent === chatAgent || e.agent_id === chatAgent);
      });
      sessionEvents.forEach(function (e) {
        var key = msgKey(e.role, e.content || e.response || e.message, e.timestamp);
        seenMessages[key] = true;
      });

      addSystemMessage("Connected to agent: " + chatAgent);

      // Normalise timestamps to ms
      function tsMs(v) {
        if (!v) return 0;
        if (typeof v === "string") return new Date(v).getTime();
        return v < 1e12 ? v * 1000 : v;
      }

      function loadSession(sid) {
        // Clear chat area and ALL dedup state for a clean slate
        msgsEl.innerHTML = "";
        seenMessages = {};
        pendingDedup = {};
        currentSessionId = sid;

        // Hide banner — only live WS events should trigger it
        hideOtherSessionBanner();

        addSystemMessage("Loading session: " + sid + "…");

        Promise.all([
          PinchyAPI.getSession(chatAgent, sid),
          PinchyAPI.getReceipts(chatAgent, sid).catch(function () { return { receipts: [] }; })
        ]).then(function (results) {
          msgsEl.innerHTML = "";
          var sess = results[0];
          var receiptData = results[1];
          var msgs = sess.messages || sess;
          if (!Array.isArray(msgs) || msgs.length === 0) {
            addSystemMessage("Session " + sid + " (empty)");
            return;
          }
          var receipts = receiptData.receipts || [];

          msgs.sort(function (a, b) { return tsMs(a.timestamp) - tsMs(b.timestamp); });

          var receiptQueue = receipts.slice().sort(function (a, b) {
            return (a.started_at || 0) - (b.started_at || 0);
          });
          var ri = 0;

          msgs.forEach(function (m) {
            var role = m.role || "";
            if (role === "system") return;
            var key = msgKey(role, m.content, m.timestamp);
            seenMessages[key] = true;

            if (role === "user") {
              addUserMessage(m.content || "", m.timestamp);
            } else {
              addAssistantMessage(m);
            }

            if (role === "assistant") {
              var msgT = tsMs(m.timestamp);
              while (ri < receiptQueue.length) {
                var r = receiptQueue[ri];
                var rEnd = (r.started_at || 0) + (r.duration_ms || 0);
                if (rEnd <= msgT + 5000) {
                  addReceiptSummary(r);
                  ri++;
                } else {
                  break;
                }
              }
            }
          });

          while (ri < receiptQueue.length) {
            addReceiptSummary(receiptQueue[ri]);
            ri++;
          }
          addSystemMessage("Loaded session: " + sid);
        }).catch(function () {
          addSystemMessage("Failed to load session " + sid);
        });
      }

      // Initial load: fetch session list then load the current one
      loadSessionList().then(function (sid) {
        if (sid) loadSession(sid);
      });

      // -- Streaming state --
      var streamingDiv = null;   // the DOM element being streamed into
      var streamingText = "";    // accumulated text

      function getOrCreateStreamingMsg() {
        if (streamingDiv) return streamingDiv;

        streamingDiv = document.createElement("div");
        streamingDiv.className = "chat-msg assistant streaming";

        var roleEl = document.createElement("div");
        roleEl.className = "msg-role";
        roleEl.textContent = "assistant";
        streamingDiv.appendChild(roleEl);

        var contentEl = document.createElement("div");
        contentEl.className = "msg-content";
        streamingDiv.appendChild(contentEl);

        msgsEl.appendChild(streamingDiv);
        streamingText = "";
        return streamingDiv;
      }

      function appendStreamDelta(delta) {
        var div = getOrCreateStreamingMsg();
        streamingText += delta;
        var contentEl = div.querySelector(".msg-content");
        if (contentEl) {
          contentEl.className = "msg-content md-body";
          contentEl.innerHTML = renderMarkdown(streamingText);
        }
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }

      function finaliseStream() {
        if (streamingDiv) {
          streamingDiv.classList.remove("streaming");
          var contentEl = streamingDiv.querySelector(".msg-content");
          if (contentEl) contentEl.innerHTML = renderMarkdown(streamingText);
          var tsEl = document.createElement("div");
          tsEl.className = "msg-ts";
          tsEl.textContent = new Date().toLocaleTimeString();
          streamingDiv.appendChild(tsEl);
          pendingDedup[contentKey("assistant", streamingText)] = Date.now();
        }
        streamingDiv = null;
        streamingText = "";
      }

      // -- Tool activity tracking --
      var activityBlock = null;  // current .chat-tool-activity container
      var activityStartTimes = {}; // tool invocation start times keyed by tool name

      function getOrCreateActivityBlock() {
        if (activityBlock) return activityBlock;
        activityBlock = document.createElement("div");
        activityBlock.className = "chat-tool-activity" + (showActivity ? " visible" : "");
        msgsEl.appendChild(activityBlock);
        return activityBlock;
      }

      function addToolActivityLine(toolName, detail, icon, cssClass) {
        var block = getOrCreateActivityBlock();
        var line = document.createElement("div");
        line.className = "tool-act-line" + (cssClass ? " " + cssClass : "");
        line.setAttribute("data-tool", toolName);
        var iconSpan = document.createElement("span");
        iconSpan.className = "tool-act-icon";
        iconSpan.textContent = icon || "⚡";
        var nameSpan = document.createElement("span");
        nameSpan.className = "tool-act-name";
        nameSpan.textContent = toolName;
        var detailSpan = document.createElement("span");
        detailSpan.className = "tool-act-detail";
        detailSpan.textContent = detail || "";
        line.appendChild(iconSpan);
        line.appendChild(nameSpan);
        line.appendChild(detailSpan);
        block.appendChild(line);
        msgsEl.scrollTop = msgsEl.scrollHeight;
        return line;
      }

      function finaliseToolLine(toolName, durationMs, isError) {
        if (!activityBlock) return;
        var lines = activityBlock.querySelectorAll('.tool-act-line[data-tool="' + toolName + '"]');
        var line = lines[lines.length - 1];
        if (!line) return;
        var iconEl = line.querySelector(".tool-act-icon");
        if (isError) {
          line.classList.add("error");
          if (iconEl) iconEl.textContent = "✗";
        } else {
          line.classList.add("success");
          if (iconEl) iconEl.textContent = "✓";
        }
        if (durationMs != null) {
          var durSpan = document.createElement("span");
          durSpan.className = "tool-act-dur";
          durSpan.textContent = durationMs >= 1000 ? (durationMs / 1000).toFixed(1) + "s" : durationMs + "ms";
          line.appendChild(durSpan);
        }
        var detailEl = line.querySelector(".tool-act-detail");
        if (detailEl && detailEl.textContent === "running…") detailEl.textContent = "";
      }

      function closeActivityBlock() {
        activityBlock = null;
        activityStartTimes = {};
      }

      function addReceiptSummary(receipt) {
        // Remove preceding live activity block(s) — activityBlock ref may
        // already be null if stream_delta called closeActivityBlock() earlier,
        // so scan the DOM for the last .chat-tool-activity and remove it.
        var prevActs = msgsEl.querySelectorAll('.chat-tool-activity');
        if (prevActs.length > 0) {
          prevActs[prevActs.length - 1].parentNode.removeChild(prevActs[prevActs.length - 1]);
        }
        closeActivityBlock();

        var div = document.createElement("div");
        div.className = "chat-receipt" + (showActivity ? " visible" : "");

        var calls = receipt.tool_calls || [];
        if (calls.length > 0) {
          var toolsEl = document.createElement("div");
          toolsEl.className = "receipt-tools";
          calls.forEach(function (tc) {
            var row = document.createElement("div");
            row.className = "receipt-tool-row" + (tc.success === false ? " error" : "");
            var icon = document.createElement("span");
            icon.className = "receipt-tool-icon";
            icon.textContent = tc.success === false ? "✗" : "✓";
            var name = document.createElement("span");
            name.className = "receipt-tool-name";
            name.textContent = tc.tool || "tool";
            var args = document.createElement("span");
            args.className = "receipt-tool-args";
            args.textContent = formatToolArgs(tc.tool, tc.args_summary);
            args.title = tc.args_summary || "";
            var dur = document.createElement("span");
            dur.className = "receipt-tool-dur";
            dur.textContent = tc.duration_ms >= 1000 ? (tc.duration_ms / 1000).toFixed(1) + "s" : tc.duration_ms + "ms";
            row.appendChild(icon);
            row.appendChild(name);
            row.appendChild(args);
            row.appendChild(dur);
            if (tc.error) {
              var errEl = document.createElement("span");
              errEl.className = "receipt-tool-err";
              errEl.textContent = tc.error;
              row.appendChild(errEl);
            }
            toolsEl.appendChild(row);
          });
          div.appendChild(toolsEl);
        }

        var footer = document.createElement("div");
        footer.className = "receipt-footer";
        var tokens = receipt.tokens || {};
        var totalDur = receipt.duration_ms ? (receipt.duration_ms / 1000).toFixed(1) + "s" : "—";
        var parts = [];
        if (calls.length > 0) parts.push("⚡ " + calls.length + " tool" + (calls.length > 1 ? "s" : ""));
        parts.push((tokens.total_tokens || 0) + " tok (" + (tokens.prompt_tokens || 0) + "→" + (tokens.completion_tokens || 0) + ")");
        parts.push(totalDur);
        if (receipt.model_calls > 1) parts.push(receipt.model_calls + " calls");
        footer.textContent = parts.join(" · ");
        div.appendChild(footer);

        msgsEl.appendChild(div);
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }

      function formatToolArgs(toolName, argsSummary) {
        if (!argsSummary) return "";
        try {
          var obj = JSON.parse(argsSummary);
          if (toolName === "exec_shell" || toolName === "shell") {
            var cmd = obj.command || obj.cmd || "";
            return cmd.length > 60 ? cmd.slice(0, 57) + "…" : cmd;
          }
          if (toolName === "read_file" || toolName === "write_file") {
            return obj.path || obj.file || obj.filename || "";
          }
          if (toolName === "search_tools") {
            return obj.query || obj.q || "";
          }
          if (toolName === "send_message" || toolName === "send_rich") {
            return (obj.channel || "") + (obj.content ? " " + obj.content.slice(0, 40) : "");
          }
          var keys = Object.keys(obj);
          for (var i = 0; i < keys.length; i++) {
            var v = obj[keys[i]];
            if (typeof v === "string" && v.length > 0) {
              var s = keys[i] + "=" + v;
              return s.length > 60 ? s.slice(0, 57) + "…" : s;
            }
          }
          return argsSummary.length > 60 ? argsSummary.slice(0, 57) + "…" : argsSummary;
        } catch (_) {
          return argsSummary.length > 60 ? argsSummary.slice(0, 57) + "…" : argsSummary;
        }
      }

      return {
        onEvent: function (data) {
          // Handle agent_list updates (no agent field on these)
          if (data.type === "agent_list" || data.type === "list_agents") {
            if (Array.isArray(data.agents) && data.agents.length) {
              populateAgents(data.agents);
            }
            return;
          }

          var agent = data.agent || data.agent_id || "";
          if (agent !== chatAgent) return;

          // Determine which session this event belongs to
          var eventSession = data.session || data.session_id || null;

          // If we know the event's session and it doesn't match what we're viewing,
          // show the other-session banner instead of injecting into the chat
          if (eventSession && currentSessionId && eventSession !== currentSessionId) {
            // Track what the server is actually doing
            activeServerSession = eventSession;

            if (data.type === "typing_start" || data.type === "tool_start" || data.type === "stream_delta") {
              var detail = "";
              if (data.type === "tool_start") detail = "running " + (data.tool || "tool");
              else if (data.type === "stream_delta") detail = "responding…";
              else detail = "thinking…";
              showOtherSessionBanner(eventSession, detail);
            } else if (data.type === "typing_stop" || (data.type === "stream_delta" && data.done)) {
              // Activity finished — hide banner after a brief delay
              clearTimeout(otherSessionTimer);
              otherSessionTimer = setTimeout(hideOtherSessionBanner, 5000);
            } else if (data.type === "turn_receipt") {
              // Turn completed in other session — refresh session list to update timestamps
              loadSessionList();
              clearTimeout(otherSessionTimer);
              otherSessionTimer = setTimeout(hideOtherSessionBanner, 5000);
            }
            return;
          }

          // Event is for the session we're viewing (or has no session tag) — handle normally
          if (eventSession) activeServerSession = eventSession;

          if (data.type === "typing_start") {
            setTyping(true, "Thinking…");
          } else if (data.type === "typing_stop") {
            setTyping(false);
          } else if (data.type === "tool_start") {
            setTyping(true, "Running " + (data.tool || "tool") + "…");
            activityStartTimes[data.tool || "tool"] = Date.now();
            addToolActivityLine(data.tool || "tool", "running…", "⚡");
          } else if (data.type === "tool_end") {
            setTyping(true, "Thinking…");
            var toolName = data.tool || "tool";
            var elapsed = activityStartTimes[toolName] ? Date.now() - activityStartTimes[toolName] : null;
            finaliseToolLine(toolName, elapsed, false);
            delete activityStartTimes[toolName];
          } else if (data.type === "stream_delta") {
            setTyping(false);
            closeActivityBlock();
            appendStreamDelta(data.delta || "");
            if (data.done) finaliseStream();
          } else if (data.type === "session_message") {
            // Dedup: skip messages already loaded via REST
            var key = msgKey(data.role, data.content || data.response || data.message, data.timestamp);
            if (seenMessages[key]) return;
            var cKey = contentKey(data.role, data.content || data.response || data.message);
            if (pendingDedup[cKey]) {
              if (Date.now() - pendingDedup[cKey] < 30000) {
                seenMessages[key] = true;
                return;
              }
              delete pendingDedup[cKey];
            }
            seenMessages[key] = true;
            if (data.role === "user") {
              addUserMessage(data.content || "", data.timestamp);
            } else {
              addAssistantMessage(data);
            }
          } else if (data.type === "slash_response") {
            setTyping(false);
            addAssistantMessage({ role: "system", content: data.response || data.content });
          } else if (data.type === "slash_error") {
            setTyping(false);
            addAssistantMessage({ role: "system", content: "Error: " + (data.error || data.content) });
          } else if (data.type === "tool_error") {
            setTyping(true, "Error in " + (data.tool || "tool") + " — retrying…");
            var errTool = data.tool || "tool";
            var errElapsed = activityStartTimes[errTool] ? Date.now() - activityStartTimes[errTool] : null;
            finaliseToolLine(errTool, errElapsed, true);
            delete activityStartTimes[errTool];
          } else if (data.type === "turn_receipt") {
            addReceiptSummary(data);
          }
        },
        onUserMessage: function (text, agent) {
          if (agent === chatAgent) {
            addUserMessage(text);
            setTyping(true, "Thinking…");
          }
        },
        destroy: function () {
          container.style.display = "";
          container.style.flexDirection = "";
          container.style.gap = "";
          container.style.padding = "";
          container.style.alignItems = "";
          var shell = document.querySelector(".shell");
          if (shell) shell.classList.remove("chat-active");
        },
      };
    }
  };
})();
