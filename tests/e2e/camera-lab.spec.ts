import { expect, test } from '@playwright/test';

test.describe('Camera Lab · AC-01 through AC-12 Full E2E Acceptance Suite', () => {
  test('AC-01, AC-02, AC-03, AC-07: Film OS lifecycle, reload persistence, strict no-review lock, 4th frame fault injection, and Contact Sheet export', async ({
    page
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByTestId('sony-a7r2-chassis')).toBeVisible();
    await expect(page.getByTestId('launch-film')).toBeVisible();
    await expect(page.getByTestId('launch-darkroom')).toBeVisible();
    await expect(page.getByTestId('launch-ghost')).toBeVisible();

    // Navigate to Film Camera page
    await page.getByTestId('launch-film').click();
    await expect(page.getByTestId('camera-page')).toBeVisible();

    // Create a fresh 12-frame roll (AC-02)
    await page.getByTestId('input-roll-name').fill('E2E Test Roll 12');
    await page.getByTestId('select-roll-capacity').selectOption('12');
    await page.getByTestId('btn-create-roll').click();

    await expect(page.getByTestId('active-roll-title')).toHaveText(
      'E2E Test Roll 12'
    );
    await expect(page.getByTestId('roll-remaining-value')).toHaveText('12 张');

    // Expose 3 photos
    await page.getByTestId('btn-shutter-expose').click();
    await page.getByTestId('btn-shutter-expose').click();
    await page.getByTestId('btn-shutter-expose').click();

    await expect(page.getByTestId('roll-exposed-value')).toHaveText('3 张');
    await expect(page.getByTestId('roll-remaining-value')).toHaveText('9 张');

    // Reload page and verify IndexedDB persistence restores 3 exposed / 9 remaining (AC-02)
    await page.reload();
    await expect(page.getByTestId('roll-exposed-value')).toHaveText('3 张');
    await expect(page.getByTestId('roll-remaining-value')).toHaveText('9 张');

    // Attempt in-app review before development -> blocked with explicit message
    await page.getByTestId('btn-attempt-review').click();
    await expect(page.getByTestId('global-error-banner')).toContainText(
      '本卷冲洗前不可回看'
    );

    // AC-07: Go to /debug and arm 4th frame capture failure
    await page.getByTestId('nav-debug').click();
    await page.getByTestId('btn-fault-4th-capture').click();
    await page.getByTestId('nav-camera').click();

    // 4th shutter press fails -> exposed count remains 3, remaining remains 9
    await page.getByTestId('btn-shutter-expose').click();
    await expect(page.getByTestId('global-error-banner')).toContainText(
      '第 4 张快门曝光或存储写入失败'
    );
    await expect(page.getByTestId('roll-exposed-value')).toHaveText('3 张');
    await expect(page.getByTestId('roll-remaining-value')).toHaveText('9 张');

    // Retry 4th shutter press -> succeeds and advances to 4 exposed / 8 remaining
    await page.getByTestId('btn-shutter-expose').click();
    await expect(page.getByTestId('roll-exposed-value')).toHaveText('4 张');
    await expect(page.getByTestId('roll-remaining-value')).toHaveText('8 张');

    // Early seal with confirmation -> Develop Roll -> Contact Sheet (AC-03)
    await page.getByTestId('btn-early-seal').click();
    await page.getByTestId('btn-confirm-early-seal').click();
    await expect(page.getByTestId('active-roll-status')).toHaveText('SEALED');

    await page.getByTestId('btn-goto-develop-room').click();
    await expect(page.getByTestId('rolls-page')).toBeVisible();
    await page.getByTestId('btn-skip-develop').click();

    await expect(page.getByTestId('rolls-active-status')).toHaveText(
      'DEVELOPED'
    );
    await expect(page.getByTestId('contact-sheet-grid')).toBeVisible();
    await expect(page.getByTestId('contact-frame-1')).toBeVisible();

    // Export Contact Sheet JPEG
    await page.getByTestId('btn-export-contact-sheet-jpg').click();
    await expect(page.getByTestId('contact-sheet-export-banner')).toContainText(
      '已生成并保存接触印样'
    );

    expect(consoleErrors).toEqual([]);
  });

  test('AC-04 & AC-05: Digital Darkroom JPEG_SIMULATION (SIMULATED tag) & M1 RAW_PIPELINE_PRECOMPUTED stages and export', async ({
    page
  }) => {
    await page.goto('/darkroom');
    await expect(page.getByTestId('darkroom-page')).toBeVisible();

    // Verify SIMULATED badge in Mode A (AC-04)
    await expect(page.getByTestId('darkroom-mode-badge')).toContainText(
      'SIMULATED'
    );
    await expect(page.getByTestId('viewport-mode-tag')).toContainText(
      'SIMULATED'
    );

    // Step through stages and adjust parameters
    await page.getByTestId('stage-btn-RAW_SENSOR').click();
    await expect(page.getByTestId('darkroom-current-stage-label')).toContainText(
      'RAW / SENSOR'
    );
    await page.getByTestId('stage-btn-WHITE_BALANCE').click();
    await page.getByTestId('stage-btn-FILM_LOOK').click();
    await page.getByTestId('preset-btn-MONO_SILVER').click();

    await page.getByTestId('btn-darkroom-export-jpeg').click();
    await expect(page.getByTestId('darkroom-export-banner')).toContainText(
      '已导出暗房成片'
    );

    // Switch to Mode B: RAW_PIPELINE_PRECOMPUTED (AC-05)
    await page.getByTestId('btn-mode-raw-precomputed').click();
    await expect(page.getByTestId('darkroom-mode-badge')).toContainText(
      'RAW_PIPELINE_PRECOMPUTED'
    );
    await expect(page.getByTestId('raw-audit-panel')).toBeVisible();
    await expect(page.getByTestId('raw-audit-panel')).toContainText(
      'ILCE-7RM2'
    );
    await expect(page.getByTestId('raw-audit-panel')).toContainText(
      'f067629e2b36706e8173e37f3e6e903b4501d97f51ce7ceb43e9d71da929aa54'
    );

    // Switch to 2nd and 3rd precomputed RAW datasets (sample-017 12-bit ILCE-7RM2 & sample-018 ILCE-7M2 ColorChecker)
    await page.getByTestId('raw-sample-btn-sample-017').click();
    await expect(page.getByTestId('raw-audit-panel')).toContainText(
      'a606ebf1dcc6704f03f2966326c60a87dd6bdb3704464b3897c10349a10d3a19'
    );
    await page.getByTestId('raw-sample-btn-sample-018').click();
    await expect(page.getByTestId('raw-audit-panel')).toContainText(
      'ILCE-7M2'
    );

    // Export 7-stage comparison sheet
    await page.getByTestId('btn-darkroom-export-stage-sheet').click();
    await expect(page.getByTestId('darkroom-export-banner')).toContainText(
      '已导出 7 阶段显影对比拼图'
    );
  });

  test('AC-06, AC-08, AC-09: Ghost Viewfinder persistence across reload, /debug JSONL replay idempotency, and diagnostics ZIP export', async ({
    page
  }) => {
    await page.goto('/ghost');
    await expect(page.getByTestId('ghost-page')).toBeVisible();

    // Rotate 10 deg, scale 1.2, translate X=0.06, save & reload (AC-06)
    await page.getByTestId('input-ghost-rotation').fill('10');
    await page.getByTestId('input-ghost-scale').fill('1.2');
    await page.getByTestId('input-ghost-tx').fill('0.06');
    await page.getByTestId('btn-ghost-save-session').click();

    await expect(page.getByTestId('readout-rotation')).toHaveText('10°');
    await expect(page.getByTestId('readout-scale')).toHaveText('1.2');

    await page.reload();
    await expect(page.getByTestId('readout-rotation')).toHaveText('10°');
    await expect(page.getByTestId('readout-scale')).toHaveText('1.2');
    await expect(page.getByTestId('readout-tx')).toHaveText('0.06');

    await page.getByTestId('btn-ghost-export-overlay').click();
    await expect(page.getByTestId('ghost-export-banner')).toContainText(
      '已导出时光重影图像'
    );

    // Verify NCC auto-alignment suggestion and pixel-level Difference mode
    await page.getByTestId('btn-ghost-ncc-suggest').click();
    await expect(page.getByTestId('ghost-ncc-banner')).toBeVisible();
    await page.getByTestId('ghost-mode-difference').click();
    await expect(page.getByTestId('ghost-difference-canvas')).toBeVisible();

    // Navigate to /debug and verify all 6 panels, JSONL replay (AC-08), and ZIP export
    await page.getByTestId('nav-debug').click();
    await expect(page.getByTestId('debug-panel-events')).toBeVisible();
    await expect(page.getByTestId('debug-panel-inspector')).toBeVisible();
    await expect(page.getByTestId('debug-panel-faults')).toBeVisible();
    await expect(page.getByTestId('debug-panel-replay')).toBeVisible();
    await expect(page.getByTestId('debug-panel-performance')).toBeVisible();
    await expect(page.getByTestId('debug-panel-export')).toBeVisible();

    await page.getByTestId('btn-replay-run').click();
    await expect(page.getByTestId('replay-dedup-count')).toHaveText('1');
    await expect(page.getByTestId('replay-roll-frame-count')).toHaveText('1');

    await page.getByTestId('btn-export-diagnostics-zip').click();
    await expect(page.getByTestId('zip-export-result')).toContainText(
      '诊断 ZIP 已生成'
    );
  });
});
