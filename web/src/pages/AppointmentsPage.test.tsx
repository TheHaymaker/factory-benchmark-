import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixtures, mockApi } from '../test/mockApi';
import { renderApp } from '../test/renderApp';

const { patient, appointment } = fixtures;

describe('AppointmentsPage', () => {
  it("lists the current patient's appointments and cancels one", async () => {
    const cancelled = { ...appointment, status: 'cancelled' };
    const { calls, setHandler } = mockApi({
      'GET /patients': [patient],
      'GET /appointments?patientId=pat_1': [appointment],
      'POST /appointments/apt_1/cancel': () => {
        setHandler('GET /appointments?patientId=pat_1', [cancelled]);
        return { body: cancelled };
      },
    });
    renderApp('/appointments', { currentPatientId: 'pat_1' });

    expect(await screen.findByTestId('appointment-status-apt_1')).toHaveTextContent('booked');
    await userEvent.click(screen.getByTestId('appointment-cancel-apt_1'));

    expect(await screen.findByText('cancelled')).toBeInTheDocument();
    expect(screen.queryByTestId('appointment-cancel-apt_1')).not.toBeInTheDocument();
    expect(calls.map((c) => c.key)).toContain('POST /appointments/apt_1/cancel');
  });

  it('asks for a patient when none is selected', async () => {
    mockApi({ 'GET /patients': [patient] });
    renderApp('/appointments');
    expect(await screen.findByTestId('select-patient-hint')).toBeInTheDocument();
  });
});
