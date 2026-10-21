import { bookedSlot, createPatient, get, RUIZ } from '../lib/api.js';
import { actAs, expect, startWorld, test } from './fixtures.js';

// Cross-ticket UI flow (T2–T5): a patient joins through the UI, gets an offer, accepts it.
test('X join via UI → cancellation → offer → accept → appointment listed', async ({ page }) => {
  await startWorld(page);
  const patient = await createPatient();
  await actAs(page, '/waitlist', patient.id);
  await page.getByTestId('waitlist-provider-select').selectOption(RUIZ);
  await page.getByTestId('waitlist-earliest').fill('2030-01-08');
  await page.getByTestId('waitlist-latest').fill('2030-01-20');
  await page.getByTestId('waitlist-submit').click();
  await expect(page.getByTestId('waitlist-status')).toHaveText(/active/i);

  const { slot, cancel } = await bookedSlot(RUIZ, '2030-01-15T14:00:00.000Z');
  await cancel();
  await actAs(page, '/waitlist', patient.id);
  await page.getByTestId('offer-accept').click();
  await expect(page.getByTestId('waitlist-status')).toHaveText(/booked/i);

  await page.getByTestId('nav-appointments').click();
  const appointments = (await get(`/appointments?patientId=${patient.id}`)).body as Array<{
    id: string;
    slotId: string;
  }>;
  const mine = appointments.find((a) => a.slotId === slot.id);
  expect(mine).toBeDefined();
  await expect(page.getByTestId(`appointment-row-${mine!.id}`)).toContainText('Dr. Ana Ruiz');
});
