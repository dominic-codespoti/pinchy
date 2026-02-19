// Pinchy API module – all REST endpoint wrappers
// No dependencies; uses native fetch.
(function (root) {
  "use strict";

  var BASE = "";

  function jsonHeaders() {
    return { "Content-Type": "application/json" };
  }

  async function request(method, path, body) {
    var opts = { method: method, headers: jsonHeaders() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    var resp = await fetch(BASE + path, opts);
    if (!resp.ok) {
      var text = "";
      try { text = await resp.text(); } catch (_) {}
      throw new Error(text || resp.statusText || ("HTTP " + resp.status));
    }
    var ct = resp.headers.get("content-type") || "";
    if (ct.indexOf("application/json") >= 0) return resp.json();
    return resp.text();
  }

  // ── Config ────────────────────────────────────────────────

  function getConfig() {
    return request("GET", "/api/config");
  }

  function saveConfig(cfg) {
    return request("PUT", "/api/config", cfg);
  }

  // ── Agents ────────────────────────────────────────────────

  function listAgents() {
    return request("GET", "/api/agents");
  }

  function getAgent(id) {
    return request("GET", "/api/agents/" + encodeURIComponent(id));
  }

  function createAgent(data) {
    return request("POST", "/api/agents", data);
  }

  function updateAgent(id, data) {
    return request("PUT", "/api/agents/" + encodeURIComponent(id), data);
  }

  function deleteAgent(id) {
    return request("DELETE", "/api/agents/" + encodeURIComponent(id));
  }

  // ── Agent workspace files ─────────────────────────────────

  function getAgentFile(agentId, filename) {
    return request("GET", "/api/agents/" + encodeURIComponent(agentId) + "/files/" + encodeURIComponent(filename));
  }

  function saveAgentFile(agentId, filename, content) {
    return request("PUT", "/api/agents/" + encodeURIComponent(agentId) + "/files/" + encodeURIComponent(filename), { content: content });
  }

  // ── Sessions ──────────────────────────────────────────────

  function getCurrentSession(agentId) {
    return request("GET", "/api/agents/" + encodeURIComponent(agentId) + "/session/current");
  }

  function listSessions(agentId) {
    return request("GET", "/api/agents/" + encodeURIComponent(agentId) + "/sessions");
  }

  function getSession(agentId, file) {
    return request("GET", "/api/agents/" + encodeURIComponent(agentId) + "/sessions/" + encodeURIComponent(file));
  }

  function updateSession(agentId, file, messages) {
    return request("PUT", "/api/agents/" + encodeURIComponent(agentId) + "/sessions/" + encodeURIComponent(file), { messages: messages });
  }

  function deleteSession(agentId, file) {
    return request("DELETE", "/api/agents/" + encodeURIComponent(agentId) + "/sessions/" + encodeURIComponent(file));
  }

  // ── Cron Jobs ─────────────────────────────────────────────

  function listCronJobs() {
    return request("GET", "/api/cron/jobs");
  }

  function getCronJobsByAgent(agentId) {
    return request("GET", "/api/cron/jobs/" + encodeURIComponent(agentId));
  }

  function createCronJob(data) {
    return request("POST", "/api/cron/jobs", data);
  }

  function updateCronJob(jobId, data) {
    return request("PUT", "/api/cron/jobs/" + encodeURIComponent(jobId) + "/update", data);
  }

  function deleteCronJob(jobId) {
    return request("DELETE", "/api/cron/jobs/" + encodeURIComponent(jobId) + "/delete");
  }

  function getCronJobRuns(jobId) {
    return request("GET", "/api/cron/jobs/" + encodeURIComponent(jobId) + "/runs");
  }

  // ── Heartbeat ─────────────────────────────────────────────

  function getHeartbeat() {
    return request("GET", "/api/heartbeat/status");
  }

  function getHeartbeatAgent(agentId) {
    return request("GET", "/api/heartbeat/status/" + encodeURIComponent(agentId));
  }

  // ── Logs (WebSocket stream) ───────────────────────────────

  function streamLogs(onMessage, onOpen, onClose) {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var ws = new WebSocket(proto + "//" + location.host + "/ws/logs");
    ws.onopen = function () { if (onOpen) onOpen(); };
    ws.onclose = function () { if (onClose) onClose(); };
    ws.onerror = function () { ws.close(); };
    ws.onmessage = function (ev) {
      try { onMessage(JSON.parse(ev.data)); } catch (_) {}
    };
    return ws;
  }

  // ── Receipts ───────────────────────────────────────────────

  function listReceipts(agentId) {
    return request("GET", "/api/agents/" + encodeURIComponent(agentId) + "/receipts");
  }

  function getReceipts(agentId, sessionId) {
    return request("GET", "/api/agents/" + encodeURIComponent(agentId) + "/receipts/" + encodeURIComponent(sessionId));
  }

  // ── Skills ────────────────────────────────────────────────

  function getSkills() {
    return request("GET", "/api/skills");
  }

  // ── Status ────────────────────────────────────────────────

  function getStatus() {
    return request("GET", "/api/status");
  }

  // ── Export ────────────────────────────────────────────────

  var API = {
    getConfig: getConfig,
    saveConfig: saveConfig,
    listAgents: listAgents,
    getAgent: getAgent,
    createAgent: createAgent,
    updateAgent: updateAgent,
    deleteAgent: deleteAgent,
    getAgentFile: getAgentFile,
    saveAgentFile: saveAgentFile,
    getCurrentSession: getCurrentSession,
    listSessions: listSessions,
    getSession: getSession,
    updateSession: updateSession,
    deleteSession: deleteSession,
    listCronJobs: listCronJobs,
    getCronJobsByAgent: getCronJobsByAgent,
    createCronJob: createCronJob,
    updateCronJob: updateCronJob,
    deleteCronJob: deleteCronJob,
    getCronJobRuns: getCronJobRuns,
    getHeartbeat: getHeartbeat,
    getHeartbeatAgent: getHeartbeatAgent,
    streamLogs: streamLogs,
    listReceipts: listReceipts,
    getReceipts: getReceipts,
    getSkills: getSkills,
    getStatus: getStatus,
  };

  root.PinchyAPI = API;
})(window);
