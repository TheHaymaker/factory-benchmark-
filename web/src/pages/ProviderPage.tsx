import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Appointment, Slot } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { useCurrentPatient } from '../context/CurrentPatientContext';
import { useApiData } from '../hooks/useApiData';
import { formatDateTime } from '../lib/format';

export function ProviderPage() {
  const { providerId = '' } = useParams();
  const { currentPatient } = useCurrentPatient();
  const provider = useApiData(() => api.getProvider(providerId), [providerId]);
  const slots = useApiData(() => api.listAvailableSlots(providerId), [providerId]);

  const [selected, setSelected] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [booked, setBooked] = useState<Appointment | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const book = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !currentPatient) return;
    setError(null);
    try {
      const appointment = await api.bookAppointment({
        patientId: currentPatient.id,
        slotId: selected.id,
        reason: reason || undefined,
      });
      setBooked(appointment);
      setSelected(null);
      setReason('');
      slots.reload();
    } catch (err) {
      setError(err as Error);
    }
  };

  return (
    <section>
      <h2>{provider.data?.name ?? 'Provider'}</h2>
      {provider.data && <p className="muted">{provider.data.specialty}</p>}
      <ErrorBanner error={provider.error ?? slots.error ?? error} />
      {!currentPatient && (
        <p className="hint" data-testid="select-patient-hint">
          Select a patient at the top of the page to book.
        </p>
      )}
      {booked && (
        <p className="success" data-testid="booking-success">
          Booked {formatDateTime(booked.startsAt)} for {booked.patientName}.
        </p>
      )}

      <h3>Available times</h3>
      {slots.data?.length === 0 && (
        <p data-testid="slots-empty">No available times in the next two weeks.</p>
      )}
      <ul className="slot-list" data-testid="slot-list">
        {slots.data?.map((slot) => (
          <li key={slot.id} data-testid={`slot-row-${slot.id}`}>
            <span>{formatDateTime(slot.startsAt)}</span>
            <button
              type="button"
              data-testid={`slot-book-${slot.id}`}
              disabled={!currentPatient}
              onClick={() => {
                setSelected(slot);
                setBooked(null);
              }}
            >
              Book
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <form className="panel" onSubmit={book} data-testid="booking-form">
          <p>
            Book <strong>{formatDateTime(selected.startsAt)}</strong> for{' '}
            <strong>{currentPatient?.name}</strong>
          </p>
          <label>
            Reason for visit (optional)
            <input
              data-testid="booking-reason-input"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button type="submit" data-testid="booking-submit">
            Confirm booking
          </button>
          <button type="button" data-testid="booking-cancel" onClick={() => setSelected(null)}>
            Back
          </button>
        </form>
      )}
    </section>
  );
}
