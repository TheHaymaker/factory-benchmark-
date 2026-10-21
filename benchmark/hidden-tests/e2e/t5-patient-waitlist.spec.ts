import { bookedSlot, createPatient, entriesFor, join, pendingOffers, RUIZ } from '../lib/api.js';
import { actAs, expect, startWorld, test } from './fixtures.js';

test.describe('T5 patient waitlist UI', () => {
  test.beforeEach(async ({ page }) => {
    await startWorld(page);
  });

  test('nav link opens the waitlist page', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nav-waitlist').click();
    await expect(page).toHaveURL(/\/waitlist$/);
    await expect(page.getByTestId('waitlist-form')).toBeVisible();
  });

  test('joins the waitlist through the form', async ({ page }) => {
    const patient = await createPatient();
    await actAs(page, '/waitlist', patient.id);
    await page.getByTestId('waitlist-provider-select').selectOption(RUIZ);
    await page.getByTestId('waitlist-earliest').fill('2030-01-08');
    await page.getByTestId('waitlist-latest').fill('2030-01-20');
    await page.getByTestId('waitlist-submit').click();

    await expect(page.getByTestId('waitlist-entry')).toHaveCount(1);
    await expect(page.getByTestId('waitlist-status')).toHaveText(/active/i);

    const entries = await entriesFor(patient.id);
    expect(entries).toEqual([
      expect.objectContaining({
        providerId: RUIZ,
        earliestAt: '2030-01-08T00:00:00.000Z',
        latestAt: '2030-01-20T23:59:59.999Z',
        status: 'active',
      }),
    ]);
  });

  test('can join for any provider', async ({ page }) => {
    const patient = await createPatient();
    await actAs(page, '/waitlist', patient.id);
    await page.getByTestId('waitlist-provider-select').selectOption('');
    await page.getByTestId('waitlist-earliest').fill('2030-01-08');
    await page.getByTestId('waitlist-latest').fill('2030-01-09');
    await page.getByTestId('waitlist-submit').click();
    await expect(page.getByTestId('waitlist-entry')).toHaveCount(1);
    expect((await entriesFor(patient.id))[0]).toMatchObject({ providerId: null });
  });

  test('shows validation errors inline and creates nothing', async ({ page }) => {
    const patient = await createPatient();
    await actAs(page, '/waitlist', patient.id);
    await page.getByTestId('waitlist-provider-select').selectOption(RUIZ);
    await page.getByTestId('waitlist-earliest').fill('2030-01-20');
    await page.getByTestId('waitlist-latest').fill('2030-01-08');
    await page.getByTestId('waitlist-submit').click();

    const error = page.getByTestId('waitlist-form').getByTestId('waitlist-error');
    await expect(error).toBeVisible();
    await expect(error).not.toBeEmpty();
    expect(await entriesFor(patient.id)).toEqual([]);
  });

  test('leaving removes the entry', async ({ page }) => {
    const patient = await createPatient();
    await join({ patientId: patient.id, providerId: RUIZ });
    await actAs(page, '/waitlist', patient.id);
    await expect(page.getByTestId('waitlist-entry')).toHaveCount(1);
    await page.getByTestId('waitlist-leave').click();
    await expect(page.getByTestId('waitlist-entry')).toHaveCount(0);
    expect(await entriesFor(patient.id)).toEqual([]);
  });

  test.describe('with a pending offer', () => {
    let patientId: string;
    test.beforeEach(async ({ page }) => {
      patientId = (await createPatient()).id;
      await join({ patientId, providerId: RUIZ });
      const { cancel } = await bookedSlot(RUIZ, '2030-01-15T14:00:00.000Z');
      await cancel();
      await actAs(page, '/waitlist', patientId);
    });

    test('shows slot details and a countdown', async ({ page }) => {
      const card = page.getByTestId('offer-card');
      await expect(card).toHaveCount(1);
      await expect(card).toContainText('Dr. Ana Ruiz');
      await expect(page.getByTestId('waitlist-status')).toHaveText(/offered/i);
      await expect(card.getByTestId('offer-countdown')).toHaveText(/\b(1[0-5]|[0-9]):[0-5]\d\b/);
    });

    test('accepting books without a page reload', async ({ page }) => {
      await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
      await page.getByTestId('offer-accept').click();
      await expect(page.getByTestId('waitlist-status')).toHaveText(/booked/i);
      await expect(page.getByTestId('offer-card')).toHaveCount(0);
      expect(
        await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
      ).toBe(true);
      expect(await pendingOffers(patientId)).toEqual([]);
    });

    test('declining removes the offer and returns the entry to active', async ({ page }) => {
      await page.getByTestId('offer-decline').click();
      await expect(page.getByTestId('offer-card')).toHaveCount(0);
      await expect(page.getByTestId('waitlist-status')).toHaveText(/active/i);
    });
  });
});
