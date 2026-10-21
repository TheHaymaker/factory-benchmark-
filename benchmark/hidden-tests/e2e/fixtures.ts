import { test as base, type Page } from '@playwright/test';
import { resetWorld, T0 } from '../lib/api.js';

/** Every spec starts from seeded data with server and browser clocks at T0 (+ offset). */
export async function startWorld(page: Page, browserMinutesAfterT0 = 0) {
  await resetWorld();
  await page.clock.install({ time: new Date(Date.parse(T0) + browserMinutesAfterT0 * 60_000) });
}

/** Load a page and choose the patient the front desk is acting for. */
export async function actAs(page: Page, path: string, patientId: string) {
  await page.goto(path);
  await page.getByTestId('current-patient-select').selectOption(patientId);
}

export const test = base;
export { expect } from '@playwright/test';
