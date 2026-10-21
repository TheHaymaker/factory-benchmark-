import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixtures, mockApi } from '../test/mockApi';
import { renderApp } from '../test/renderApp';

const { patient, provider, slot } = fixtures;

const entry = {
  id: 'wl_1',
  patientId: 'pat_1',
  providerId: 'prv_1',
  earliestAt: '2030-01-08T00:00:00.000Z',
  latestAt: '2030-01-20T23:59:59.999Z',
  status: 'active',
  createdAt: new Date(Date.now() - (2 * 60 + 5) * 60_000).toISOString(),
  patientName: 'Jordan Lee',
  providerName: 'Dr. Ana Ruiz',
};
const anyEntry = { ...entry, id: 'wl_2', providerId: null, providerName: null, status: 'offered' };

describe('StaffWaitlistPage', () => {
  it('lists entries with provider, status and wait time', async () => {
    mockApi({ 'GET /patients': [patient], 'GET /staff/waitlist': [entry, anyEntry] });
    renderApp('/staff/waitlist');
    const rows = await screen.findAllByTestId('staff-waitlist-row');
    expect(rows[0]).toHaveTextContent('Dr. Ana Ruiz');
    expect(rows[0]).toHaveTextContent('2h 5m');
    expect(rows[1]).toHaveTextContent('Any provider');
    expect(within(rows[1]!).queryByTestId('staff-offer-button')).not.toBeInTheDocument();
  });

  it('makes a manual offer', async () => {
    const { calls, setHandler } = mockApi({
      'GET /patients': [patient],
      'GET /staff/waitlist': [entry],
      'GET /providers': [provider],
      'GET /providers/prv_1/slots?available=true': [slot],
      'POST /staff/offers': () => {
        setHandler('GET /staff/waitlist', [{ ...entry, status: 'offered' }]);
        return { status: 201, body: {} };
      },
    });
    renderApp('/staff/waitlist');
    await userEvent.click(await screen.findByTestId('staff-offer-button'));
    await screen.findByRole('option', { name: /Dr. Ana Ruiz/ });
    await userEvent.selectOptions(screen.getByTestId('staff-offer-slot-select'), 'slt_1');
    await userEvent.click(screen.getByTestId('staff-offer-confirm'));
    expect(await screen.findByText('offered')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'POST /staff/offers')?.body).toEqual({
      entryId: 'wl_1',
      slotId: 'slt_1',
    });
  });

  it('shows the API error when the offer fails', async () => {
    mockApi({
      'GET /patients': [patient],
      'GET /staff/waitlist': [entry],
      'GET /providers': [provider],
      'GET /providers/prv_1/slots?available=true': [slot],
      'POST /staff/offers': () => ({
        status: 409,
        body: { error: { code: 'SLOT_NOT_OPEN', message: 'This slot is not open' } },
      }),
    });
    renderApp('/staff/waitlist');
    await userEvent.click(await screen.findByTestId('staff-offer-button'));
    await userEvent.click(screen.getByTestId('staff-offer-confirm'));
    expect(await screen.findByTestId('staff-offer-error')).toHaveTextContent(/choose a slot/i);
    await screen.findByRole('option', { name: /Dr. Ana Ruiz/ });
    await userEvent.selectOptions(screen.getByTestId('staff-offer-slot-select'), 'slt_1');
    await userEvent.click(screen.getByTestId('staff-offer-confirm'));
    expect(await screen.findByTestId('staff-offer-error')).toHaveTextContent(
      'This slot is not open',
    );
  });
});
