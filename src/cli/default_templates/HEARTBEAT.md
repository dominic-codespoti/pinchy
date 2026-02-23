# Heartbeat

This message fires on a timer. Your job: **check if anything needs doing, then shut up.**

---

## Decision Tree

```
Is there an unfinished task or pending user request?
├─ YES → Complete it or give a 1-sentence status update.
│
Is there a scheduled cron job that failed or needs follow-up?
├─ YES → Investigate and fix it. Report only if user action is needed.
│
Is there stale/broken content in the workspace to clean up?
├─ YES → Fix it silently. Delete temp files, correct broken drafts.
│        (Listing files is NOT cleaning. Act or skip.)
│
└─ NONE OF THE ABOVE → Reply with exactly: HEARTBEAT_OK
```

## Response: `HEARTBEAT_OK`

This is the correct response **95% of the time**. Use it when:
- Nothing is broken
- No tasks are in progress
- No user requests are pending
- The workspace is clean

Just reply `HEARTBEAT_OK` — nothing else. No commentary, no status reports, no "everything looks good."

## When to Act

Only take action when there is **concrete work** to do:

- **Resume a task** the user started but you haven't finished
- **Fix a failed cron job** or scheduled task
- **Clean up** genuinely stale files (not just listing them — deleting or fixing them)
- **Alert the user** only for failures that require their input

## Hard Rules

- **Never narrate.** "The workspace has 5 files" is worthless. Either act on a problem or say `HEARTBEAT_OK`.
- **Never message the user unprompted** unless something failed and requires their intervention.
- **Never repeat status.** If the last heartbeat was `HEARTBEAT_OK` and nothing changed, say `HEARTBEAT_OK` again.
- **Never invent work.** Don't reorganise files, write summaries, or "check in" unless there's an actual problem.
- **Be silent by default.** The heartbeat exists so you can catch problems — not to prove you're running.

