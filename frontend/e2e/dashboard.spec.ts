import { test, expect } from '@playwright/test';

test.describe('SPC Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses
    await page.route('**/api/spc/plants?*', async (route) => {
      await route.fulfill({ json: [{ plant_id: '1000', plant_name: 'Test Plant' }] });
    });
    await page.route('**/api/spc/characteristics?*', async (route) => {
      await route.fulfill({ json: { characteristics: [{ mic_id: 'MIC-1', mic_name: 'Test MIC', operation_id: '10', chart_type: 'individuals', batch_count: 50 }], attrCharacteristics: [] } });
    });
    await page.route('**/api/spc/validate-material?*', async (route) => {
      await route.fulfill({ json: { material_id: 'MAT-1', material_name: 'Test Material' } });
    });

    // Navigate to the dashboard
    await page.goto('/');
    // Wait for the app to load
    await expect(page.locator('text=Loading SPC workspace…')).not.toBeVisible();
  });

  test('should load the overview tab by default', async ({ page }) => {
    const overviewTab = page.locator('role=tab[name="Overview"]');
    await expect(overviewTab).toBeVisible();
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    
    // Check for some overview content (e.g., KPICard or Recent Violations)
    // Based on OverviewPage structure (assuming it has these labels)
    await expect(page.locator('text=Overview')).toBeVisible();
  });

  test('should navigate between primary tabs', async ({ page }) => {
    const tabs = ['Process Flow', 'Scorecard'];
    
    for (const tabName of tabs) {
      const tab = page.locator(`role=tab[name="${tabName}"]`);
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('should allow selecting a material', async ({ page }) => {
    const input = page.locator('#spc-material');
    await input.fill('MAT-1');
    await page.keyboard.press('Enter');
    
    // Check for validation success (helperText)
    await expect(page.locator('text=Validated: Test Material')).toBeVisible();
    
    // Plant select should now be enabled
    const plantSelect = page.locator('#spc-plant');
    await expect(plantSelect).toBeEnabled();
  });

  test('should require material selection for charts tab', async ({ page }) => {
    const chartsTab = page.locator('role=tab[name="Control Charts"]');
    await expect(chartsTab).toBeVisible();
    await expect(chartsTab).toBeDisabled();
    
    // Check tooltip or title for unavailable reason
    const title = await chartsTab.getAttribute('title');
    expect(title).toBe('Select a material first');
  });
});
