import { expect, test } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

test('settings tab keeps heartbeat disabled after save and reload', async ({ page }) => {
  let savedPayload: Record<string, unknown> | null = null;
  const agentSettingsTab = page.locator('[role="tab"][aria-controls*="content-settings"]').last();

  const initialDetail = {
    id: 'default',
    soul: null,
    tools: null,
    heartbeat: null,
    session_count: 0,
    model: 'gpt-4o-mini',
    provider: 'openai',
    heartbeat_enabled: true,
    heartbeat_secs: 300,
    max_tool_iterations: 5,
    enabled_skills: [],
    history_messages: 5,
    max_turns: 10,
    compact_keep_recent_turns: 5,
    timezone: 'UTC',
    reasoning_effort: 'medium',
    header_overrides: [],
    watch_paths: [],
  };

  const disabledDetail = {
    ...initialDetail,
    heartbeat_enabled: false,
    heartbeat_secs: null,
  };

  await page.route('**/api/agents/default', async (route) => {
    const request = route.request();

    if (request.method() === 'GET') {
      await route.fulfill({ json: savedPayload ? disabledDetail : initialDetail });
      return;
    }

    if (request.method() === 'PUT') {
      savedPayload = request.postDataJSON();
      await route.fulfill({ json: { id: 'default', updated: ['heartbeat_enabled', 'heartbeat_secs'], header_overrides: [] } });
      return;
    }

    await route.fallback();
  });

  await page.goto(`${BASE_URL}/agents/default`);
  await page.waitForLoadState('networkidle');

  await agentSettingsTab.click();
  await expect(page.getByLabel('Enable heartbeat')).toBeChecked();

  await page.getByLabel('Enable heartbeat').uncheck();
  await expect(page.getByText('Save Settings')).toBeEnabled();

  await page.getByRole('button', { name: 'Save Settings' }).click();
  await page.waitForLoadState('networkidle');

  expect(savedPayload).not.toBeNull();
  expect(savedPayload).toMatchObject({
    heartbeat_enabled: false,
    heartbeat_secs: null,
  });

  await page.reload();
  await page.waitForLoadState('networkidle');
  await agentSettingsTab.click();

  await expect(page.getByLabel('Enable heartbeat')).not.toBeChecked();
});
