import { useState } from 'react';
import { api } from '../api/client';
import { ErrorBanner } from '../components/ErrorBanner';
import { useCurrentPatient } from '../context/CurrentPatientContext';
import { useApiData } from '../hooks/useApiData';
import { formatDateTime } from '../lib/format';

export function AppointmentsPage() {
  const { currentPatient } = useCurrentPatient();
  const patientId = currentPatient?.id;
  const appointments = useApiData(patientId ? () => api.listAppointments({ patientId }) : null, [
    patientId,
  ]);
  const [error, setError] = useState<Error | null>(null);

  const cancel = async (id: string) => {
    setError(null);
    try {
      await api.cancelAppointment(id);
      appointments.reload();
    } catch (err) {
      setError(err as Error);
    }
  };

  if (!currentPatient) {
    return (
      <p className="hint" data-testid="select-patient-hint">
        Select a patient at the top of the page to see their appointments.
      </p>
    );
  }

  return (
    <section>
      <h2>Appointments for {currentPatient.name}</h2>
      <ErrorBanner error={appointments.error ?? error} />
      {appointments.data?.length === 0 && (
        <p data-testid="appointments-empty">No appointments yet.</p>
      )}
      <table data-testid="appointment-list">
        <tbody>
          {appointments.data?.map((appointment) => (
            <tr key={appointment.id} data-testid={`appointment-row-${appointment.id}`}>
              <td>{formatDateTime(appointment.startsAt)}</td>
              <td>{appointment.providerName}</td>
              <td data-testid={`appointment-status-${appointment.id}`}>{appointment.status}</td>
              <td>
                {appointment.status === 'booked' && (
                  <button
                    type="button"
                    data-testid={`appointment-cancel-${appointment.id}`}
                    onClick={() => cancel(appointment.id)}
                  >
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
