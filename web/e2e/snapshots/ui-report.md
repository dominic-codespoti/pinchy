# Pinchy Web UI Inspection Report

Generated: 2026-04-01T06:46:03.700Z
Pages inspected: 22
Viewport: 1280×720 (desktop)
Mock data: MSW enabled

---

## Summary

| Page | Load (ms) | Headings | Buttons | Links | Inputs | Errors | Network Failures |
|------|-----------|----------|---------|-------|--------|--------|-----------------|
| Dashboard | 2916 | 10 | 20 | 31 | 0 | 0 | 0 |
| Agents List | 2479 | 1 | 41 | 24 | 0 | 0 | 0 |
| Agent Detail (default) | 2403 | 1 | 21 | 26 | 0 | 1 | 0 |
| Agent Test | 3196 | 2 | 27 | 25 | 1 | 0 | 0 |
| Agent Detail (researcher) | 2337 | 1 | 21 | 26 | 0 | 1 | 0 |
| Chat | 2372 | 3 | 30 | 24 | 1 | 0 | 0 |
| Sessions | 2322 | 8 | 31 | 48 | 0 | 4 | 0 |
| Memories | 2853 | 1 | 23 | 25 | 0 | 0 | 0 |
| Models | 2456 | 3 | 26 | 24 | 0 | 0 | 0 |
| Skills | 3047 | 1 | 38 | 24 | 0 | 0 | 0 |
| Cron Jobs | 2977 | 5 | 69 | 24 | 0 | 8 | 0 |
| System Logs | 2383 | 1 | 26 | 24 | 1 | 0 | 0 |
| Login | 2694 | 1 | 24 | 24 | 0 | 0 | 0 |
| Admin | 2865 | 1 | 24 | 24 | 0 | 0 | 0 |
| Analytics | 3605 | 1 | 23 | 24 | 0 | 0 | 0 |
| Settings - Appearance | 3050 | 1 | 28 | 31 | 0 | 0 | 0 |
| Settings - Notifications | 2989 | 1 | 35 | 31 | 0 | 0 | 0 |
| Settings - MCP | 2765 | 1 | 22 | 31 | 0 | 0 | 0 |
| Settings - Advanced | 2750 | 1 | 24 | 31 | 7 | 2 | 0 |
| Settings - Security | 3087 | 1 | 19 | 35 | 0 | 0 | 0 |
| Settings - Maintenance (Stub) | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| Settings - Webhooks (Stub) | 0 | 0 | 0 | 0 | 0 | 1 | 0 |

---

## Dashboard

- **Route:** `/dashboard`
- **Final URL:** `/dashboard`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2916ms

### Headings
- h1: "Dashboard"
- h2: "Recent Agents"
- h2: "Agent Status"
- h2: "Model Distribution"
- h2: "Agent Overview"
- h2: "Recent Activity"
- h3: "Total Agents"
- h3: "Online Agents"
- h3: "Active Jobs"
- h3: "System Status"

### Interactive Elements
- Buttons: 20
- Links: 31
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Dashboard" [level=1]
  - link "Analytics":
    - /url: /analytics
    - button "Analytics"
  - heading "Total Agents" [level=3]
  - text: 3 3 active
  - heading "Online Agents" [level=3]
  - text: 3 3 total
  - heading "Active Jobs" [level=3]
  - text: 4 4 total
  - heading "System Status" [level=3]
  - text: Healthy All services operational
  - heading "Recent Agents" [level=2]
  - text: Last 5
  - table:
    - rowgroup:
      - row "Agent Status":
        - columnheader "Agent"
        - columnheader "Status"
    - rowgroup:
      - row "default Online":
        - cell "default":
          - link "default":
            - /url: /agents/default
        - cell "Online"
      - row "test-agent-ui Online":
        - cell "test-agent-ui":
          - link "test-agent-ui":
            - /url: /agents/test-agent-ui
        - cell "Online"
      - row "ux_agent_test Online":
        - cell "ux_agent_test":
          - link "ux_agent_test":
            - /url: /agents/ux_agent_test
        - cell "Online"
  - heading "Agent Status" [level=2]
  - text: By Heartbeat
  - table:
    - rowgroup:
      - row "Agent Status":
        - columnheader "Agent"
        - columnheader "Status"
    - rowgroup:
      - row "default Online":
        - cell "default":
          - link "default":
            - /url: /agents/default
        - cell "Online"
      - row "test-agent-ui Online":
        - cell "test-agent-ui":
          - link "test-agent-ui":
            - /url: /agents/test-agent-ui
        - cell "Online"
      - row "ux_agent_test Online":
        - cell "ux_agent_test":
          - link "ux_agent_test":
            - /url: /agents/ux_agent_test
        - cell "Online"
  - heading "Model Distribution" [level=2]
  - text: "Agents by model type unknown 2 copilot-default 1 Total: 3 agents across 2 models"
  - heading "Agent Overview" [level=2]
  - text: Quick stats summary Total Agents 3 Active 3 With Heartbeat 3
  - heading "Recent Activity" [level=2]
  - text: Latest sessions across all agents 0 sessions
  - paragraph: No recent activity
  - paragraph: Sessions will appear here when agents start conversations
```

---

## Agents List

- **Route:** `/agents`
- **Final URL:** `/agents`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2479ms

### Headings
- h1: "Agents"

### Interactive Elements
- Buttons: 41
- Links: 24
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Agents" [level=1]
  - button "Hide Groups"
  - button "Export"
  - button "New Agent"
  - complementary:
    - button "Groups" [expanded]
    - button "All Agents (3)"
    - button "Ungrouped (3)"
    - status
    - button "New Group"
  - main:
    - text: Showing all 3 agents
    - table:
      - rowgroup:
        - row "Select all agents Name Description Groups Heartbeat Provider Actions":
          - columnheader "Select all agents":
            - checkbox "Select all agents"
          - columnheader "Name":
            - button "Name"
          - columnheader "Description"
          - columnheader "Groups"
          - columnheader "Heartbeat"
          - columnheader "Provider":
            - button "Provider"
          - columnheader "Actions"
      - rowgroup:
        - row "View agent default":
          - cell "Select default":
            - checkbox "Select default"
          - cell "default"
          - 'cell "Model: copilot-default"'
          - cell
          - cell "Online"
          - cell "copilot"
          - cell "Open menu":
            - button "Open menu"
        - row "View agent test-agent-ui":
          - cell "Select test-agent-ui":
            - checkbox "Select test-agent-ui"
          - cell "test-agent-ui"
          - cell "No model configured"
          - cell
          - cell "Online"
          - cell "default"
          - cell "Open menu":
            - button "Open menu"
        - row "View agent ux_agent_test":
          - cell "Select ux_agent_test":
            - checkbox "Select ux_agent_test"
          - cell "ux_agent_test"
          - cell "No model configured"
          - cell
          - cell "Online"
          - cell "default"
          - cell "Open menu":
            - button "Open menu"
```

---

## Agent Detail (default)

- **Route:** `/agents/default`
- **Final URL:** `/agents/default`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2403ms

### Headings
- h5: "Agent not found"

### Interactive Elements
- Buttons: 21
- Links: 26
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - link "Back to Agents":
    - /url: /agents
    - button "Back to Agents"
  - alert:
    - heading "Agent not found" [level=5]
    - text: The agent you're looking for doesn't exist or has been deleted.
    - link "Return to agents list":
      - /url: /agents
      - button "Return to agents list"
```

### ⚠️ Error Elements in DOM
- "Agent not foundThe agent you're looking for doesn't exist or has been deleted.Return to agents list"

### Empty State Indicators
- "Agent not found"

---

## Agent Test

- **Route:** `/agents/default/test`
- **Final URL:** `/agents/default/test`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 3196ms

### Headings
- h1: "Test:"
- h3: "Ready to test"

### Interactive Elements
- Buttons: 27
- Links: 25
- Inputs: 1
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - link:
    - /url: /agents/undefined
    - button
  - heading "Test:" [level=1]
  - paragraph: Send messages to test agent behavior
  - text: Connected
  - button "Clear" [disabled]
  - button "Hello"
  - button "What can you do?"
  - button "Help me with a task"
  - button "What tools do you have?"
  - button "Tell me about yourself"
  - heading "Ready to test" [level=3]
  - paragraph: Send a message to start testing .
  - paragraph: Use the preset buttons above or type your own message.
  - textbox "Type a test message..."
  - button [disabled]
  - text: Press Enter to send, Shift+Enter for new line
```

---

## Agent Detail (researcher)

- **Route:** `/agents/researcher`
- **Final URL:** `/agents/researcher`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2337ms

### Headings
- h5: "Agent not found"

### Interactive Elements
- Buttons: 21
- Links: 26
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - link "Back to Agents":
    - /url: /agents
    - button "Back to Agents"
  - alert:
    - heading "Agent not found" [level=5]
    - text: The agent you're looking for doesn't exist or has been deleted.
    - link "Return to agents list":
      - /url: /agents
      - button "Return to agents list"
```

### ⚠️ Error Elements in DOM
- "Agent not foundThe agent you're looking for doesn't exist or has been deleted.Return to agents list"

### Empty State Indicators
- "Agent not found"

---

## Chat

- **Route:** `/chat`
- **Final URL:** `/chat`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2372ms

### Headings
- h1: "Chat with default"
- h3: "Recent Sessions"
- h3: "Start a new chat"

### Interactive Elements
- Buttons: 30
- Links: 24
- Inputs: 1
- Selects: 2

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - complementary:
    - text: Chat
    - combobox: default
    - button "New Chat"
    - heading "Recent Sessions" [level=3]
    - button "Ping Message Received 9 days ago 2876 messages":
      - paragraph: Ping Message Received
      - text: 9 days ago 2876 messages
    - button "Test Message 10 days ago 2 messages":
      - paragraph: Test Message
      - text: 10 days ago 2 messages
    - button "Summarize Repo and Suggest Next Task 11 days ago 4 messages":
      - paragraph: Summarize Repo and Suggest Next Task
      - text: 11 days ago 4 messages
    - button "Untitled Session 12 days ago 0 messages":
      - paragraph: Untitled Session
      - text: 12 days ago 0 messages
    - button "Assistant's Knowledge Cutoff Info 15 days ago 6 messages":
      - paragraph: Assistant's Knowledge Cutoff Info
      - text: 15 days ago 6 messages
  - main:
    - heading "Chat with default" [level=1]
    - text: Connected
    - heading "Start a new chat" [level=3]
    - paragraph: Select an agent and start a conversation
    - combobox: default
    - button "New Chat"
    - textbox "Type a message..."
    - button [disabled]
```

---

## Sessions

- **Route:** `/sessions`
- **Final URL:** `/sessions`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2322ms

### Headings
- h1: "Sessions"
- h2: "All Sessions"
- h3: "[stub] echo: Give this conversation a very short title (max 6 words). Reply with ONLY the title, no quotes, no punctuation at the end.

User message: hi"
- h3: "Ping Message Received"
- h3: "Test Message"
- h3: "Summarize Repo and Suggest Next Task"
- h3: "Untitled Session"
- h3: "Assistant's Knowledge Cutoff Info"

### Interactive Elements
- Buttons: 31
- Links: 48
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Sessions" [level=1]
  - paragraph: Manage all chat sessions across your agents
  - heading "All Sessions" [level=2]
  - table:
    - rowgroup:
      - row "Title Agent Messages Created Updated Actions":
        - columnheader "Title"
        - columnheader "Agent"
        - columnheader "Messages"
        - columnheader "Created"
        - columnheader "Updated"
        - columnheader "Actions"
    - rowgroup:
      - 'row "[stub] echo: Give this conversation a very short title (max 6 words). Reply with ONLY the title, no quotes, no punctuation at the end. User message: hi test-agent-ui 2 3/29/2026 3/29/2026 View Delete"':
        - 'cell "[stub] echo: Give this conversation a very short title (max 6 words). Reply with ONLY the title, no quotes, no punctuation at the end. User message: hi"':
          - 'link "[stub] echo: Give this conversation a very short title (max 6 words). Reply with ONLY the title, no quotes, no punctuation at the end. User message: hi"':
            - /url: /chat?agent=test-agent-ui&session=92c6cd98-e66e-4699-b039-191b76a19908
        - cell "test-agent-ui"
        - cell "2"
        - cell "3/29/2026"
        - cell "3/29/2026"
        - cell "View Delete":
          - link "View":
            - /url: /chat?agent=test-agent-ui&session=92c6cd98-e66e-4699-b039-191b76a19908
          - button "Delete"
      - row "Ping Message Received default 2876 3/23/2026 3/23/2026 View Delete":
        - cell "Ping Message Received":
          - link "Ping Message Received":
            - /url: /chat?agent=default&session=daaac4f0-a696-4538-8db3-ee2d878235a8
        - cell "default"
        - cell "2876"
        - cell "3/23/2026"
        - cell "3/23/2026"
        - cell "View Delete":
          - link "View":
            - /url: /chat?agent=default&session=daaac4f0-a696-4538-8db3-ee2d878235a8
          - button "Delete"
      - row "Test Message default 2 3/22/2026 3/22/2026 View Delete":
        - cell "Test Message":
          - link "Test Message":
            - /url: /chat?agent=default&session=b1c13006-4be5-4b33-9f72-95ab33d2b179
        - cell "default"
        - cell "2"
        - cell "3/22/2026"
        - cell "3/22/2026"
        - cell "View Delete":
          - link "View":
            - /url: /chat?agent=default&session=b1c13006-4be5-4b33-9f72-95ab33d2b179
          - button "Delete"
      - row "Summarize Repo and Suggest Next Task default 4 3/21/2026 3/21/2026 View Delete":
        - cell "Summarize Repo and Suggest Next Task":
          - link "Summarize Repo and Suggest Next Task":
            - /url: /chat?agent=default&session=18a824f6-4d4e-4ba7-bc2f-dbb471d7f06c
        - cell "default"
        - cell "4"
        - cell "3/21/2026"
        - cell "3/21/2026"
        - cell "View Delete":
          - link "View":
            - /url: /chat?agent=default&session=18a824f6-4d4e-4ba7-bc2f-dbb471d7f06c
          - button "Delete"
      - row "Untitled Session default 0 3/20/2026 3/20/2026 View Delete":
        - cell "Untitled Session":
          - link "Untitled Session":
            - /url: /chat?agent=default&session=e0cf6120-3796-4b37-86ed-8ef171aa3ee4
        - cell "default"
        - cell "0"
        - cell "3/20/2026"
        - cell "3/20/2026"
        - cell "View Delete":
          - link "View":
            - /url: /chat?agent=default&session=e0cf6120-3796-4b37-86ed-8ef171aa3ee4
          - button "Delete"
      - row "Assistant's Knowledge Cutoff Info default 6 3/18/2026 3/18/2026 View Delete":
        - cell "Assistant's Knowledge Cutoff Info":
          - link "Assistant's Knowledge Cutoff Info":
            - /url: /chat?agent=default&session=c8d7d54b-86ae-4dbb-872e-9374c0ce6124
        - cell "default"
        - cell "6"
        - cell "3/18/2026"
        - cell "3/18/2026"
        - cell "View Delete":
          - link "View":
            - /url: /chat?agent=default&session=c8d7d54b-86ae-4dbb-872e-9374c0ce6124
          - button "Delete"
```

### ⚠️ Error Elements in DOM
- "Delete"
- "Delete"
- "Delete"
- "Delete"

---

## Memories

- **Route:** `/memories`
- **Final URL:** `/memories`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2853ms

### Headings
- h1: "Memories"

### Interactive Elements
- Buttons: 23
- Links: 25
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Memories" [level=1]
  - paragraph: View and manage agent memories
  - link "Query Builder":
    - /url: /memories/query
    - button "Query Builder"
  - text: Select Agent
  - group:
    - radio "default"
    - radio "test-agent-ui"
    - radio "ux_agent_test"
```

---

## Models

- **Route:** `/models`
- **Final URL:** `/models`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2456ms

### Headings
- h1: "Models"
- h2: "Default Model"
- h2: "Connected Providers"

### Interactive Elements
- Buttons: 26
- Links: 24
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Models" [level=1]
  - heading "Default Model" [level=2]
  - text: The model used by default for new agents and conversations
  - button "Select a default model"
  - heading "Connected Providers" [level=2]
  - text: Manage your AI provider connections 2
  - button "GitHub Copilot 25 models":
    - paragraph: GitHub Copilot
    - paragraph: 25 models
  - button
  - button "Fireworks AI 14 models":
    - paragraph: Fireworks AI
    - paragraph: 14 models
  - button
  - button "Add Provider"
  - button "Browse Models"
```

---

## Skills

- **Route:** `/skills`
- **Final URL:** `/skills`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 3047ms

### Headings
- h1: "Skills"

### Interactive Elements
- Buttons: 38
- Links: 24
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Skills" [level=1]
  - paragraph: Available skill modules for agents
  - button "Create Skill"
  - text: Xlsx Custom Handles spreadsheet workflows for reading, editing, creation, and formula validation with recalculation checks.
  - button "View Details"
  - button "Edit Xlsx"
  - button "Delete Xlsx"
  - text: Browser Custom Automates browser interactions via playwright-cli for web navigation, research, form filling, screenshots, and data extraction. Use when the user needs to browse websites, research topics, interact with web pages, or extract information. Requires playwright-cli (npm install -g @playwright/cli@latest).
  - button "View Details"
  - button "Edit Browser"
  - button "Delete Browser"
  - text: Pptx Custom Handles PowerPoint workflows including slide text extraction, deterministic rendering for visual QA, and baseline deck generation.
  - button "View Details"
  - button "Edit Pptx"
  - button "Delete Pptx"
  - text: Mcp Custom Connect to and use MCP (Model Context Protocol) servers to access external tools, data sources, and services. Use native MCP tools for configured servers or mcptools CLI for ad-hoc servers. Servers are configured in config.yaml under mcp_servers.
  - button "View Details"
  - button "Edit Mcp"
  - button "Delete Mcp"
  - text: Docx Custom Handles Word document workflows including text extraction, baseline creation, deterministic text replacement, and structural validation.
  - button "View Details"
  - button "Edit Docx"
  - button "Delete Docx"
  - text: Pdf Custom Handles PDF workflows including text extraction, merge/split operations, and validation-oriented processing.
  - button "View Details"
  - button "Edit Pdf"
  - button "Delete Pdf"
```

---

## Cron Jobs

- **Route:** `/cron`
- **Final URL:** `/cron`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2977ms

### Headings
- h1: "Cron Jobs"
- h3: "del-agent — 0 0 * * * *"
- h3: "cron-agent — 0 0 * * * *"
- h3: "cron-agent — 0 0 * * * *"
- h3: "runs-agent — 0 0 * * * *"

### Interactive Elements
- Buttons: 69
- Links: 24
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Cron Jobs" [level=1]
  - paragraph: Schedule automated tasks for your agents
  - button "Export Cron Jobs"
  - button "New Job"
  - text: 4 jobs
  - table:
    - rowgroup:
      - row "Agent Schedule Status Last Run Next Run Actions":
        - columnheader
        - columnheader "Agent"
        - columnheader "Schedule"
        - columnheader "Status"
        - columnheader "Last Run"
        - columnheader "Next Run"
        - columnheader "Actions"
    - rowgroup:
      - row "Toggle details del-agent 0 0 * * * * Every hour Active Never - Run Now History Edit Delete":
        - cell "Toggle details":
          - button "Toggle details"
        - cell "del-agent"
        - cell "0 0 * * * * Every hour"
        - cell "Active":
          - switch [checked]
          - text: Active
        - cell "Never"
        - cell "-"
        - cell "Run Now History Edit Delete":
          - button "Run Now"
          - button "History"
          - button "Edit"
          - button "Delete"
      - row "Toggle details cron-agent 0 0 * * * * Every hour Active Never - Run Now History Edit Delete":
        - cell "Toggle details":
          - button "Toggle details"
        - cell "cron-agent"
        - cell "0 0 * * * * Every hour"
        - cell "Active":
          - switch [checked]
          - text: Active
        - cell "Never"
        - cell "-"
        - cell "Run Now History Edit Delete":
          - button "Run Now"
          - button "History"
          - button "Edit"
          - button "Delete"
      - row "Toggle details cron-agent 0 0 * * * * Every hour Active Never - Run Now History Edit Delete":
        - cell "Toggle details":
          - button "Toggle details"
        - cell "cron-agent"
        - cell "0 0 * * * * Every hour"
        - cell "Active":
          - switch [checked]
          - text: Active
        - cell "Never"
        - cell "-"
        - cell "Run Now History Edit Delete":
          - button "Run Now"
          - button "History"
          - button "Edit"
          - button "Delete"
      - row "Toggle details runs-agent 0 0 * * * * Every hour Active Never - Run Now History Edit Delete":
        - cell "Toggle details":
          - button "Toggle details"
        - cell "runs-agent"
        - cell "0 0 * * * * Every hour"
        - cell "Active":
          - switch [checked]
          - text: Active
        - cell "Never"
        - cell "-"
        - cell "Run Now History Edit Delete":
          - button "Run Now"
          - button "History"
          - button "Edit"
          - button "Delete"
```

### ⚠️ Error Elements in DOM
- "Delete"
- "Delete"
- "Delete"
- "Delete"
- "Delete job"
- "Delete job"
- "Delete job"
- "Delete job"

---

## System Logs

- **Route:** `/logs`
- **Final URL:** `/logs`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2383ms

### Headings
- h1: "System Logs"

### Interactive Elements
- Buttons: 26
- Links: 24
- Inputs: 1
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "System Logs" [level=1]
  - text: Connected 140 logs | 40 live | 650 persisted
  - strong: "Recent (40):"
  - text: "In-memory ring buffer + WebSocket stream • Loaded 40 from buffer (capacity: 200)"
  - strong: "History (650):"
  - text: Persisted in SQLite with 7-day retention
  - button "All"
  - button "Error"
  - button "Warn"
  - button "Info"
  - button "Debug"
  - button "Trace"
  - textbox "Search logs..."
  - button "Clear"
  - text: "Above: Persisted history • Below: Live stream WARN 17:32:18.147 [mini_claw::mcp::client] native stdio transport not yet implemented, using mcptools fallback INFO 17:32:18.155 [pinchy] pinchy.db opened INFO 17:32:18.156 [mini_claw::skills] loaded skill INFO 17:32:18.157 [mini_claw::skills] loaded skill INFO 17:32:18.157 [mini_claw::skills] loaded skill INFO 17:32:18.157 [mini_claw::skills] loaded skill INFO 17:32:18.157 [mini_claw::skills] loaded skill INFO 17:32:18.158 [mini_claw::skills] loaded skill INFO 17:32:18.158 [pinchy] skills loaded INFO 17:32:18.158 [mini_claw::tools] unified registry synced WARN 17:32:18.158 [mini_claw::discord] DISCORD_TOKEN not set -- Discord connector disabled INFO 17:32:18.163 [pinchy] scheduler disabled (no heartbeats or cron jobs configured) WARN 17:32:18.163 [mini_claw::gateway] API authentication disabled (PINCHY_API_TOKEN not set) INFO 17:32:18.164 [mini_claw::gateway] serving web UI INFO 17:32:18.167 [mini_claw::gateway] gateway started INFO 17:32:18.167 [mini_claw::gateway] gateway enabled INFO 17:32:18.168 [pinchy] pinchy ready — all modules initialized INFO 17:32:53.487 [mini_claw::gateway::handlers::models] loaded models.dev registry INFO 17:32:53.626 [mini_claw::gateway::handlers::providers] loaded models.dev registry for provider status INFO 17:33:18.164 [mini_claw::scheduler] janitor: starting housekeeping pass INFO 17:34:12.724 [mini_claw::gateway::handlers::models] loaded models.dev registry INFO 17:34:12.726 [mini_claw::gateway::handlers::providers] loaded models.dev registry for provider status INFO 17:34:49.904 [mini_claw::gateway::handlers::providers] loaded models.dev registry for provider status INFO 17:34:49.909 [mini_claw::gateway::handlers::models] loaded models.dev registry INFO 17:41:59.148 [mini_claw::models_dev] fetching models.dev registry INFO 17:41:59.495 [mini_claw::models_dev] models.dev parsing complete INFO 17:41:59.506 [mini_claw::models_dev] loaded models.dev registry INFO 17:41:59.555 [mini_claw::models_dev] saved models.dev registry to cache INFO 17:41:59.570 [mini_claw::gateway::handlers::models] loaded models.dev registry INFO 17:41:59.585 [mini_claw::gateway::handlers::providers] loaded models.dev registry for provider status INFO 17:42:39.878 [mini_claw::gateway::handlers::models] loaded models.dev registry INFO 17:42:39.888 [mini_claw::gateway::handlers::providers] loaded models.dev registry for provider status INFO 17:45:27.225 [mini_claw::gateway::handlers::models] loaded models.dev registry INFO 17:45:27.226 [mini_claw::gateway::handlers::providers] loaded models.dev registry for provider status"
```

---

## Login

- **Route:** `/login`
- **Final URL:** `/login`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2694ms

### Headings
- h1: "Welcome to Pinchy"

### Interactive Elements
- Buttons: 24
- Links: 24
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Welcome to Pinchy" [level=1]
  - text: Sign in to manage your agents
  - tablist:
    - tab "OAuth" [selected]
    - tab "API Key"
  - tabpanel "OAuth":
    - button "OpenAI Sign in with OpenAI":
      - img
      - paragraph: OpenAI
      - paragraph: Sign in with OpenAI
    - button "GitHub Sign in with GitHub":
      - img
      - paragraph: GitHub
      - paragraph: Sign in with GitHub
    - button "Anthropic Sign in with Anthropic":
      - img
      - paragraph: Anthropic
      - paragraph: Sign in with Anthropic
```

---

## Admin

- **Route:** `/admin`
- **Final URL:** `/admin`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2865ms

### Headings
- h1: "Administration"

### Interactive Elements
- Buttons: 24
- Links: 24
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Administration" [level=1]
  - paragraph: System management and maintenance
  - text: v1.0.0 Total Agents 3
  - paragraph: Active and inactive agents
  - text: Total Sessions 6
  - paragraph: All recorded sessions
  - text: Total Messages 1439
  - paragraph: Messages across all sessions
  - text: Storage Usage 1.23 MB
  - paragraph: Database and file storage
  - text: Uptime 13m
  - paragraph: System uptime
  - tablist:
    - tab "Database" [selected]
    - tab "Backups"
    - tab "Logs"
    - tab "Maintenance"
    - tab "Debug"
  - tabpanel "Database": Database Status Current SQLite database information Journal Mode wal Synchronous 1 Foreign Keys Enabled Read Only No Estimated Size 1.23 MB Page Size 4 KB Page Count 316 Freelist Pages 0 WAL Size 3.95 MB PRAGMA Info Additional database configuration Encoding UTF-8 Schema Version 14 User Version 0 Application ID 0 Auto Vacuum None Cache Size -2,000 pages Temp Store Default Legacy Alter Table Off Reverse Unordered Selects Off Database Tables Table row counts and metadata Table Row Count Row ID sessions 6 Primary Key exchanges 2,890 Primary Key receipts 1,439 Primary Key cron_jobs 4 Primary Key cron_events 2 Primary Key heartbeat_status 2 Primary Key system_logs 650 Primary Key Database Indexes Index definitions and column coverage Index Table Columns Properties idx_sessions_agent sessions agent_id idx_exchanges_session exchanges session_id, id idx_receipts_session receipts session_id idx_receipts_agent receipts agent_id idx_cron_events_job cron_events job_id, scheduled_at idx_system_logs_timestamp system_logs timestamp idx_system_logs_level system_logs level Per-Agent Storage Estimated storage by agent across sessions, exchanges, receipts, and memory Agent ID Sessions Exchanges Receipts Memory Est. Size default 5 2,888 1,438 0 6.33 MB test-agent-ui 1 2 1 0 4.68 KB
```

---

## Analytics

- **Route:** `/analytics`
- **Final URL:** `/analytics`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 3605ms

### Headings
- h1: "Analytics"

### Interactive Elements
- Buttons: 23
- Links: 24
- Inputs: 0
- Selects: 1

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Analytics" [level=1]
  - paragraph: Monitor agent usage, performance, and costs
  - combobox: Last 7 Days
  - button "Export"
  - text: Total Requests 0
  - paragraph: Last 7 days
  - text: Tokens Used 0
  - paragraph: Input + Output tokens
  - text: Est. Cost $0.00
  - paragraph: Based on token usage
  - text: Avg Response Time N/A
  - paragraph: Not tracked yet
  - tablist:
    - tab "Usage" [selected]
    - tab "Agent Breakdown"
  - tabpanel "Usage":
    - paragraph: No usage data available for the selected time range
```

---

## Settings - Appearance

- **Route:** `/settings/appearance`
- **Final URL:** `/settings/appearance`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 3050ms

### Headings
- h1: "Settings"

### Interactive Elements
- Buttons: 28
- Links: 31
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Settings" [level=1]
  - paragraph: Manage your application preferences and configuration
  - navigation:
    - link "Appearance":
      - /url: /settings/appearance
    - link "Notifications":
      - /url: /settings/notifications
    - link "Security":
      - /url: /settings/security
    - link "Advanced":
      - /url: /settings/advanced
    - link "MCP Servers":
      - /url: /settings/mcp
    - link "Maintenance":
      - /url: /settings/maintenance
    - link "Webhooks":
      - /url: /settings/webhooks
  - text: Theme Choose between light, dark, or system preference
  - button "Light Light background with dark text"
  - button "Dark Dark background with light text"
  - button "System Follow your system preference"
  - text: Color Palette Active color theme for accents and highlights
  - paragraph: No theme
  - paragraph: Default monochrome appearance
  - paragraph: Use the color theme picker in the sidebar to change palettes. Select "No theme" for a neutral, monochrome appearance.
  - text: Surface Style Choose how surfaces and backgrounds are styled
  - button "Neutral"
  - button "Tinted"
  - button "Soft"
  - button "Contrast"
  - paragraph: Surface styles affect how cards and backgrounds appear. They become more visually distinct when a color palette is active.
```

---

## Settings - Notifications

- **Route:** `/settings/notifications`
- **Final URL:** `/settings/notifications`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2989ms

### Headings
- h1: "Settings"

### Interactive Elements
- Buttons: 35
- Links: 31
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Settings" [level=1]
  - paragraph: Manage your application preferences and configuration
  - navigation:
    - link "Appearance":
      - /url: /settings/appearance
    - link "Notifications":
      - /url: /settings/notifications
    - link "Security":
      - /url: /settings/security
    - link "Advanced":
      - /url: /settings/advanced
    - link "MCP Servers":
      - /url: /settings/mcp
    - link "Maintenance":
      - /url: /settings/maintenance
    - link "Webhooks":
      - /url: /settings/webhooks
  - text: Enable Notifications Toggle notifications on or off Enable notifications
  - paragraph: Show in-app notifications for events
  - switch "Enable notifications" [checked]
  - text: Browser notifications
  - paragraph: Show system notifications even when tab is not active
  - switch "Browser notifications"
  - text: Auto-Dismiss Configure when notifications automatically dismiss Enable auto-dismiss
  - paragraph: Automatically mark notifications as read after a delay
  - switch "Enable auto-dismiss" [checked]
  - text: Auto-dismiss delay 5s
  - slider
  - paragraph: How long to wait before auto-dismissing notifications
  - text: Event Types Choose which types of events trigger notifications
  - checkbox "Success events" [checked]
  - text: Success events
  - paragraph: Agent online, cron job completed, etc.
  - checkbox "Error events" [checked]
  - text: Error events
  - paragraph: Agent offline, job failures, high error rates
  - checkbox "Warning events" [checked]
  - text: Warning events
  - paragraph: Slow responses, resource warnings
  - checkbox "Info events"
  - text: Info events
  - paragraph: Skill activations, session events
  - checkbox "Agent status changes" [checked]
  - text: Agent status changes
  - paragraph: Get notified when agents go online or offline
  - checkbox "New log entries"
  - text: New log entries
  - paragraph: Get notified for new error and warning logs
  - text: Test Notifications Send test notifications to verify your settings
  - button "Success"
  - button "Error"
  - button "Warning"
  - button "Info"
  - text: Clear History Remove all notification history
  - button "Clear All Notifications"
  - button "Reset" [disabled]
  - button "Save Changes" [disabled]
```

---

## Settings - MCP

- **Route:** `/settings/mcp`
- **Final URL:** `/settings/mcp`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2765ms

### Headings
- h1: "Settings"

### Interactive Elements
- Buttons: 22
- Links: 31
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Settings" [level=1]
  - paragraph: Manage your application preferences and configuration
  - navigation:
    - link "Appearance":
      - /url: /settings/appearance
    - link "Notifications":
      - /url: /settings/notifications
    - link "Security":
      - /url: /settings/security
    - link "Advanced":
      - /url: /settings/advanced
    - link "MCP Servers":
      - /url: /settings/mcp
    - link "Maintenance":
      - /url: /settings/maintenance
    - link "Webhooks":
      - /url: /settings/webhooks
  - text: MCP Servers
  - button "Add Server"
  - text: Manage Model Context Protocol (MCP) server connections playwright stdio npx -y @playwright/mcp
  - button
  - button
```

---

## Settings - Advanced

- **Route:** `/settings/advanced`
- **Final URL:** `/settings/advanced`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 2750ms

### Headings
- h1: "Settings"

### Interactive Elements
- Buttons: 24
- Links: 31
- Inputs: 7
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Settings" [level=1]
  - paragraph: Manage your application preferences and configuration
  - navigation:
    - link "Appearance":
      - /url: /settings/appearance
    - link "Notifications":
      - /url: /settings/notifications
    - link "Security":
      - /url: /settings/security
    - link "Advanced":
      - /url: /settings/advanced
    - link "MCP Servers":
      - /url: /settings/mcp
    - link "Maintenance":
      - /url: /settings/maintenance
    - link "Webhooks":
      - /url: /settings/webhooks
  - text: Session & Cleanup Configure automatic session expiry and event cleanup Session expiry days
  - spinbutton "Session expiry days": "30"
  - paragraph: Days before inactive sessions are removed (0 = disabled)
  - text: Cron session expiry days
  - spinbutton "Cron session expiry days": "7"
  - paragraph: Days before cron job sessions are cleaned up (0 = disabled)
  - text: Cron events max keep
  - spinbutton "Cron events max keep": "50"
  - paragraph: Maximum heartbeat event files to retain per agent
  - text: Timezone
  - textbox "Timezone":
    - /placeholder: UTC
    - text: UTC
  - paragraph: IANA timezone for cron job scheduling (e.g., America/New_York)
  - text: Skills Gating Control which skills are available to agents Skills enabled
  - paragraph: Master switch for skill functionality
  - switch "Skills enabled" [checked]
  - text: Allow list
  - textbox "Allow list":
    - /placeholder: skill-1, skill-2, skill-3
  - paragraph: Comma-separated skill IDs to allow (empty = allow all)
  - text: Deny list
  - textbox "Deny list":
    - /placeholder: skill-4, skill-5
  - paragraph: Comma-separated skill IDs to deny (applied after allow filter)
  - text: System System-level configuration options Chromium path
  - textbox "Chromium path":
    - /placeholder: /usr/bin/chromium
  - paragraph: Path to Chromium/Chrome executable for browser automation skills (optional)
  - button "Raw Config"
  - text: "Advanced: view and edit raw configuration JSON Danger Zone Destructive actions that cannot be undone Reset to defaults"
  - paragraph: Discard all changes and restore original values
  - button "Reset" [disabled]
  - button "Reset Changes" [disabled]
  - button "Save Changes" [disabled]
```

### ⚠️ Error Elements in DOM
- "Danger Zone"
- "Danger Zone"

### Empty State Indicators
- "Comma-separated skill IDs to allow (empty = allow all)"

---

## Settings - Security

- **Route:** `/settings/security`
- **Final URL:** `/settings/security`
- **Page title:** Pinchy - Agent Operations Console
- **Load time:** 3087ms

### Headings
- h1: "Settings"

### Interactive Elements
- Buttons: 19
- Links: 35
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
- main:
  - heading "Settings" [level=1]
  - paragraph: Manage your application preferences and configuration
  - navigation:
    - link "Appearance":
      - /url: /settings/appearance
    - link "Notifications":
      - /url: /settings/notifications
    - link "Security":
      - /url: /settings/security
    - link "Advanced":
      - /url: /settings/advanced
    - link "MCP Servers":
      - /url: /settings/mcp
    - link "Maintenance":
      - /url: /settings/maintenance
    - link "Webhooks":
      - /url: /settings/webhooks
  - text: Provider API Keys API keys are configured via environment variables. Pinchy reads these from your shell or config file.
  - paragraph: OpenAI
  - paragraph: API key for GPT models
  - code: OPENAI_API_KEY
  - link "Get Key":
    - /url: https://platform.openai.com/api-keys
  - paragraph: Anthropic
  - paragraph: API key for Claude models
  - code: ANTHROPIC_API_KEY
  - link "Get Key":
    - /url: https://console.anthropic.com/settings/keys
  - paragraph: Azure OpenAI
  - paragraph: API key for Azure OpenAI service
  - code: AZURE_OPENAI_API_KEY
  - link "Get Key":
    - /url: https://portal.azure.com
  - paragraph: GitHub Copilot
  - paragraph: Token for GitHub Copilot API
  - code: COPILOT_TOKEN
  - link "Get Key":
    - /url: https://github.com/settings/tokens
  - text: Connected Accounts Manage your linked authentication providers 0 connected
  - paragraph: No accounts connected yet.
  - paragraph: Use the Models settings to connect providers.
  - text: Security Tips
  - list:
    - listitem: Use OAuth when possible - it's more secure than API keys
    - listitem: Regularly review and disconnect unused accounts
    - listitem: Never share your API keys or authentication tokens
    - listitem: API keys are stored securely by the Pinchy daemon
```

---

## Settings - Maintenance (Stub)

- **Route:** `/settings/maintenance`
- **Final URL:** `/settings/maintenance`
- **Page title:** (none)
- **Load time:** 0ms

### Headings
⚠️ **No headings found on this page**

### Interactive Elements
- Buttons: 0
- Links: 0
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
[CAPTURE FAILED: page.goto: Target page, context or browser has been closed
Call log:
[2m  - navigating to "http://localhost:3000/settings/maintenance", waiting until "networkidle"[22m
]
```

### ⚠️ Console Errors
- `Page capture failed: page.goto: Target page, context or browser has been closed
Call log:
[2m  - navigating to "http://localhost:3000/settings/maintenance", waiting until "networkidle"[22m
`

---

## Settings - Webhooks (Stub)

- **Route:** `/settings/webhooks`
- **Final URL:** `/settings/webhooks`
- **Page title:** (none)
- **Load time:** 0ms

### Headings
⚠️ **No headings found on this page**

### Interactive Elements
- Buttons: 0
- Links: 0
- Inputs: 0
- Selects: 0

### Accessibility Tree (ARIA Snapshot)

```yaml
[CAPTURE FAILED: page.goto: Target page, context or browser has been closed]
```

### ⚠️ Console Errors
- `Page capture failed: page.goto: Target page, context or browser has been closed`

---
