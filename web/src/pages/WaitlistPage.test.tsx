import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixtures, mockApi } from '../test/mockApi';
import { renderApp } from '../test/renderApp';

const { patient, provider } = fixtures;

const entry = {
  id: 'wl_1',
  patientId: 'pat_1',
  providerId: 'prv_1',
  earliestAt: '2030-01-08T00:00:00.000Z',
  latestAt: '2030-01-20T23:59:59.999Z',
  status: 'offered',
  createdAt: '2030-01-07T08:00:00.000Z',
};
const offer = {
  id: 'off_1',
  entryId: 'wl_1',
  slotId: 'slt_1',
  status: 'pending',
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  createdAt: '2030-01-07T08:00:00.000Z',
  patientId: 'pat_1',
  providerId: 'prv_1',
  providerName: 'Dr. Ana Ruiz',
  startsAt: '2030-01-15T14:00:00.000Z',
  endsAt: '2030-01-15T14:30:00.000Z',
};

describe('WaitlistPage', () => {
  it('joins the waitlist with whole-day UTC bounds', async () => {
    const { calls, setHandler } = mockApi({
      'GET /patients': [patient],
      'GET /providers': [provider],
      'GET /waitlist?patientId=pat_1': [],
      'GET /offers?patientId=pat_1': [],
      'POST /waitlist': () => {
        setHandler('GET /waitlist?patientId=pat_1', [{ ...entry, status: 'active' }]);
        return { status: 201, body: entry };
      },
    });
    renderApp('/waitlist', { currentPatientId: 'pat_1' });
    await screen.findByRole('option', { name: 'Dr. Ana Ruiz' });
    await userEvent.selectOptions(screen.getByTestId('waitlist-provider-select'), 'prv_1');
    await userEvent.type(screen.getByTestId('waitlist-earliest'), '2030-01-08');
    await userEvent.type(screen.getByTestId('waitlist-latest'), '2030-01-20');
    await userEvent.click(screen.getByTestId('waitlist-submit'));

    expect(await screen.findByTestId('waitlist-status')).toHaveTextContent('active');
    expect(calls.find((c) => c.key === 'POST /waitlist')?.body).toEqual({
      patientId: 'pat_1',
      providerId: 'prv_1',
      earliestAt: '2030-01-08T00:00:00.000Z',
      latestAt: '2030-01-20T23:59:59.999Z',
    });
  });

  it('shows validation errors inline without calling the API', async () => {
    const { calls } = mockApi({
      'GET /patients': [patient],
      'GET /providers': [provider],
      'GET /waitlist?patientId=pat_1': [],
      'GET /offers?patientId=pat_1': [],
    });
    renderApp('/waitlist', { currentPatientId: 'pat_1' });
    await userEvent.type(screen.getByTestId('waitlist-earliest'), '2030-01-20');
    await userEvent.type(screen.getByTestId('waitlist-latest'), '2030-01-08');
    await userEvent.click(screen.getByTestId('waitlist-submit'));
    expect(await screen.findByTestId('waitlist-error')).not.toBeEmptyDOMElement();
    expect(calls.map((c) => c.key)).not.toContain('POST /waitlist');
  });

  it('shows API errors inline', async () => {
    mockApi({
      'GET /patients': [patient],
      'GET /providers': [provider],
      'GET /waitlist?patientId=pat_1': [],
      'GET /offers?patientId=pat_1': [],
      'POST /waitlist': () => ({
        status: 409,
        body: { error: { code: 'DUPLICATE_ENTRY', message: 'Already waiting' } },
      }),
    });
    renderApp('/waitlist', { currentPatientId: 'pat_1' });
    await userEvent.type(screen.getByTestId('waitlist-earliest'), '2030-01-08');
    await userEvent.type(screen.getByTestId('waitlist-latest'), '2030-01-09');
    await userEvent.click(screen.getByTestId('waitlist-submit'));
    expect(await screen.findByTestId('waitlist-error')).toHaveTextContent('Already waiting');
  });

  it('accepts an offer: entry becomes booked and the card disappears', async () => {
    const { setHandler } = mockApi({
      'GET /patients': [patient],
      'GET /providers': [provider],
      'GET /waitlist?patientId=pat_1': [entry],
      'GET /offers?patientId=pat_1': [offer],
      'POST /offers/off_1/accept': () => {
        setHandler('GET /waitlist?patientId=pat_1', [{ ...entry, status: 'booked' }]);
        setHandler('GET /offers?patientId=pat_1', []);
        return { body: fixtures.appointment };
      },
    });
    renderApp('/waitlist', { currentPatientId: 'pat_1' });
    const card = await screen.findByTestId('offer-card');
    expect(card).toHaveTextContent('Dr. Ana Ruiz');
    expect(screen.getByTestId('offer-countdown').textContent).toMatch(/^(10:00|9:5\d)$/);
    await userEvent.click(screen.getByTestId('offer-accept'));
    expect(await screen.findByText('booked')).toBeInTheDocument();
    expect(screen.queryByTestId('offer-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('waitlist-leave')).not.toBeInTheDocument();
  });

  it('declines an offer: entry returns to active', async () => {
    const { setHandler } = mockApi({
      'GET /patients': [patient],
      'GET /providers': [provider],
      'GET /waitlist?patientId=pat_1': [entry],
      'GET /offers?patientId=pat_1': [offer],
      'POST /offers/off_1/decline': () => {
        setHandler('GET /waitlist?patientId=pat_1', [{ ...entry, status: 'active' }]);
        setHandler('GET /offers?patientId=pat_1', []);
        return { body: { ...offer, status: 'declined' } };
      },
    });
    renderApp('/waitlist', { currentPatientId: 'pat_1' });
    await userEvent.click(await screen.findByTestId('offer-decline'));
    expect(await screen.findByText('active')).toBeInTheDocument();
    expect(screen.queryByTestId('offer-card')).not.toBeInTheDocument();
  });

  it('leaves the waitlist', async () => {
    const { setHandler } = mockApi({
      'GET /patients': [patient],
      'GET /providers': [provider],
      'GET /waitlist?patientId=pat_1': [{ ...entry, status: 'active', providerId: null }],
      'GET /offers?patientId=pat_1': [],
      'DELETE /waitlist/wl_1': () => {
        setHandler('GET /waitlist?patientId=pat_1', []);
        return { status: 204 };
      },
    });
    renderApp('/waitlist', { currentPatientId: 'pat_1' });
    expect(await screen.findByTestId('waitlist-entry')).toHaveTextContent('Any provider');
    await userEvent.click(screen.getByTestId('waitlist-leave'));
    expect(await screen.findByTestId('waitlist-empty')).toBeInTheDocument();
  });

  it('asks for a patient before joining', async () => {
    mockApi({ 'GET /patients': [patient], 'GET /providers': [provider] });
    renderApp('/waitlist');
    await userEvent.click(screen.getByTestId('waitlist-submit'));
    expect(await screen.findByTestId('waitlist-error')).toHaveTextContent(/select a patient/i);
  });
});
