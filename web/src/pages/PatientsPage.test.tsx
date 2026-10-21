import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixtures, mockApi } from '../test/mockApi';
import { renderApp } from '../test/renderApp';

describe('PatientsPage', () => {
  it('registers a patient and makes them the current patient', async () => {
    const created = { ...fixtures.patient, id: 'pat_2', name: 'Sam Patel' };
    const { setHandler } = mockApi({
      'GET /patients': [fixtures.patient],
      'POST /patients': () => {
        setHandler('GET /patients', [fixtures.patient, created]);
        return { status: 201, body: created };
      },
    });
    renderApp('/patients');

    await screen.findByTestId('patient-row-pat_1');
    await userEvent.type(screen.getByTestId('patient-name-input'), 'Sam Patel');
    await userEvent.type(screen.getByTestId('patient-email-input'), 'sam@example.com');
    await userEvent.click(screen.getByTestId('patient-submit'));

    expect(await screen.findByTestId('patient-row-pat_2')).toBeInTheDocument();
    expect(screen.getByTestId('current-patient-select')).toHaveValue('pat_2');
  });

  it('shows a validation error from the API', async () => {
    mockApi({
      'GET /patients': [],
      'POST /patients': () => ({
        status: 409,
        body: { error: { code: 'EMAIL_TAKEN', message: 'A patient with email x already exists' } },
      }),
    });
    renderApp('/patients');
    await userEvent.type(screen.getByTestId('patient-name-input'), 'X');
    await userEvent.type(screen.getByTestId('patient-email-input'), 'x@example.com');
    await userEvent.click(screen.getByTestId('patient-submit'));
    expect(await screen.findByTestId('error-banner')).toHaveTextContent('already exists');
  });
});
