import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixtures, mockApi } from '../test/mockApi';
import { renderApp } from '../test/renderApp';

const { patient, provider, slot, appointment } = fixtures;

function setup(currentPatientId?: string) {
  const mock = mockApi({
    'GET /patients': [patient],
    'GET /providers/prv_1': provider,
    'GET /providers/prv_1/slots?available=true': [slot],
    'POST /appointments': () => ({ status: 201, body: appointment }),
  });
  renderApp('/providers/prv_1', { currentPatientId });
  return mock;
}

describe('ProviderPage', () => {
  it('lists available slots and books one for the current patient', async () => {
    const { calls, setHandler } = setup('pat_1');
    const book = await screen.findByTestId('slot-book-slt_1');
    await waitFor(() => expect(book).toBeEnabled());

    await userEvent.click(book);
    await userEvent.type(screen.getByTestId('booking-reason-input'), 'Sore throat');
    setHandler('GET /providers/prv_1/slots?available=true', []);
    await userEvent.click(screen.getByTestId('booking-submit'));

    expect(await screen.findByTestId('booking-success')).toHaveTextContent('Jordan Lee');
    expect(calls.find((c) => c.key === 'POST /appointments')?.body).toEqual({
      patientId: 'pat_1',
      slotId: 'slt_1',
      reason: 'Sore throat',
    });
    expect(await screen.findByTestId('slots-empty')).toBeInTheDocument();
  });

  it('disables booking until a patient is selected', async () => {
    setup();
    expect(await screen.findByTestId('slot-book-slt_1')).toBeDisabled();
    expect(screen.getByTestId('select-patient-hint')).toBeInTheDocument();
  });

  it('shows API errors in the error banner', async () => {
    const { setHandler } = setup('pat_1');
    setHandler('POST /appointments', () => ({
      status: 409,
      body: { error: { code: 'SLOT_UNAVAILABLE', message: 'This slot is no longer available' } },
    }));
    const book = await screen.findByTestId('slot-book-slt_1');
    await waitFor(() => expect(book).toBeEnabled());
    await userEvent.click(book);
    await userEvent.click(screen.getByTestId('booking-submit'));
    expect(await screen.findByTestId('error-banner')).toHaveTextContent('no longer available');
  });
});
