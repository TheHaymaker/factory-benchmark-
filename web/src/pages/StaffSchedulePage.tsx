import { useState } from 'react';
import { api } from '../api/client';
import { ErrorBanner } from '../components/ErrorBanner';
import { useApiData } from '../hooks/useApiData';
import { formatDateTime } from '../lib/format';

/** Staff view: every appointment for one provider. */
export function StaffSchedulePage() {
  const providers = useApiData(() => api.listProviders(), []);
  const [providerId, setProviderId] = useState('');
  const appointments = useApiData(providerId ? () => api.listAppointments({ providerId }) : null, [
    providerId,
  ]);

  return (
    <section>
      <h2>Provider schedule</h2>
      <ErrorBanner error={providers.error ?? appointments.error} />
      <label>
        Provider{' '}
        <select
          data-testid="staff-schedule-provider-select"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
        >
          <option value="">Select a provider…</option>
          {providers.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {appointments.data?.length === 0 && (
        <p data-testid="staff-schedule-empty">No appointments for this provider.</p>
      )}
      <table data-testid="staff-schedule-table">
        <tbody>
          {appointments.data?.map((a) => (
            <tr key={a.id} data-testid={`staff-schedule-row-${a.id}`}>
              <td>{formatDateTime(a.startsAt)}</td>
              <td>{a.patientName}</td>
              <td>{a.reason ?? '—'}</td>
              <td>{a.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
