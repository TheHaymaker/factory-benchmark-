import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('/api/dev/clock', { data: { now: '2030-01-07T08:00:00.000Z' } });
  await request.post('/api/dev/reset', { data: { seed: true } });
});

test('patient books an appointment and then cancels it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('current-patient-select').selectOption('pat_jordan');

  await page.getByTestId('provider-link-prv_ruiz').click();
  // Seed data: first Dr. Ruiz slot on day 0 is booked, so slot _1 is the first open one.
  await page.getByTestId('slot-book-slt_ruiz_d0_1').click();
  await page.getByTestId('booking-reason-input').fill('Follow-up');
  await page.getByTestId('booking-submit').click();
  await expect(page.getByTestId('booking-success')).toContainText('Jordan Lee');
  await expect(page.getByTestId('slot-row-slt_ruiz_d0_1')).toHaveCount(0);

  await page.getByTestId('nav-appointments').click();
  const rows = page.locator('[data-testid^="appointment-row-"]');
  const row = rows.filter({ hasText: 'Dr. Ana Ruiz' }).filter({ hasText: '9:30' });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Cancel' }).click();
  await expect(row).toContainText('cancelled');

  await page.getByTestId('nav-providers').click();
  await page.getByTestId('provider-link-prv_ruiz').click();
  await expect(page.getByTestId('slot-row-slt_ruiz_d0_1')).toBeVisible();
});
