import {
  advanceMinutes,
  book,
  createPatient,
  createSlot,
  join,
  pendingOffers,
  RUIZ,
} from '../lib/api.js';
import { expect, startWorld, test } from './fixtures.js';

test.describe('T6 staff waitlist UI', () => {
  let patient: { id: string; name: string };

  test.beforeEach(async ({ page }) => {
    // Browser runs 65 minutes after the entries are created, so wait time is visible.
    await startWorld(page, 65);
    patient = await createPatient('Morgan Staffcase');
    await join({ patientId: patient.id, providerId: RUIZ });
    const other = await createPatient('Quinn Staffcase');
    await join({ patientId: other.id, providerId: null });
    await advanceMinutes(65);
  });

  const rowFor = (page: import('@playwright/test').Page, name: string) =>
    page.getByTestId('staff-waitlist-row').filter({ hasText: name });

  test('nav link and table list entries with status and wait time', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-staff-waitlist').click();
    await expect(page).toHaveURL(/\/staff\/waitlist$/);

    const table = page.getByTestId('staff-waitlist-table');
    await expect(table.getByTestId('staff-waitlist-row')).toHaveCount(2);
    const row = rowFor(page, 'Morgan Staffcase');
    await expect(row).toContainText('Dr. Ana Ruiz');
    await expect(row).toContainText(/active/i);
    await expect(row).toContainText(/\d+\s*(m|min|h|hr|d)\b/i);
    await expect(rowFor(page, 'Quinn Staffcase')).toContainText(/any provider/i);
  });

  test('makes a manual offer', async ({ page }) => {
    const slot = await createSlot(RUIZ, '2030-01-15T15:00:00.000Z');
    await page.goto('/staff/waitlist');
    await rowFor(page, 'Morgan Staffcase').getByTestId('staff-offer-button').click();
    await page.getByTestId('staff-offer-slot-select').selectOption(slot.id);
    await page.getByTestId('staff-offer-confirm').click();

    await expect(rowFor(page, 'Morgan Staffcase')).toContainText(/offered/i);
    expect((await pendingOffers(patient.id)).map((o) => o.slotId)).toEqual([slot.id]);
  });

  test('shows the API error when the slot is no longer open', async ({ page }) => {
    const slot = await createSlot(RUIZ, '2030-01-15T15:00:00.000Z');
    await page.goto('/staff/waitlist');
    await rowFor(page, 'Morgan Staffcase').getByTestId('staff-offer-button').click();
    await page.getByTestId('staff-offer-slot-select').selectOption(slot.id);

    // Someone books the slot before staff confirm.
    await book((await createPatient()).id, slot.id);
    await page.getByTestId('staff-offer-confirm').click();

    await expect(page.getByTestId('staff-offer-error')).toBeVisible();
    await expect(page.getByTestId('staff-offer-error')).not.toBeEmpty();
    expect(await pendingOffers(patient.id)).toEqual([]);
  });
});
