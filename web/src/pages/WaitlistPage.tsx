import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { PendingOffer } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { useCurrentPatient } from '../context/CurrentPatientContext';
import { useApiData } from '../hooks/useApiData';
import { useNow } from '../hooks/useNow';
import { formatCountdown, formatDateTime } from '../lib/format';

function OfferCard({
  offer,
  now,
  onRespond,
}: {
  offer: PendingOffer;
  now: number;
  onRespond: (id: string, action: 'accept' | 'decline') => void;
}) {
  return (
    <li className="card" data-testid="offer-card">
      <span>
        {offer.providerName} · {formatDateTime(offer.startsAt)} · expires in{' '}
        <strong data-testid="offer-countdown">
          {formatCountdown(Date.parse(offer.expiresAt) - now)}
        </strong>
      </span>
      <span>
        <button
          type="button"
          data-testid="offer-accept"
          onClick={() => onRespond(offer.id, 'accept')}
        >
          Accept
        </button>{' '}
        <button
          type="button"
          data-testid="offer-decline"
          onClick={() => onRespond(offer.id, 'decline')}
        >
          Decline
        </button>
      </span>
    </li>
  );
}

export function WaitlistPage() {
  const { currentPatient } = useCurrentPatient();
  const patientId = currentPatient?.id;
  const now = useNow();
  const providers = useApiData(() => api.listProviders(), []);
  const entries = useApiData(patientId ? () => api.listWaitlist(patientId) : null, [patientId]);
  const offers = useApiData(patientId ? () => api.listOffers(patientId) : null, [patientId]);

  const [providerId, setProviderId] = useState('');
  const [earliest, setEarliest] = useState('');
  const [latest, setLatest] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);

  const reload = () => {
    entries.reload();
    offers.reload();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!patientId) return setFormError('Select a patient at the top of the page first.');
    if (!earliest || !latest) return setFormError('Choose both an earliest and a latest date.');
    if (latest < earliest) return setFormError('The latest date must not be before the earliest.');
    try {
      await api.joinWaitlist({
        patientId,
        providerId: providerId || null,
        earliestAt: `${earliest}T00:00:00.000Z`,
        latestAt: `${latest}T23:59:59.999Z`,
      });
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err as Error);
    }
    reload();
  };

  const respond = (id: string, action: 'accept' | 'decline') =>
    run(() => (action === 'accept' ? api.acceptOffer(id) : api.declineOffer(id)));

  const providerName = (id: string | null) =>
    id === null ? 'Any provider' : (providers.data?.find((p) => p.id === id)?.name ?? id);

  return (
    <section>
      <h2>Waitlist{currentPatient ? ` for ${currentPatient.name}` : ''}</h2>
      <ErrorBanner error={providers.error ?? entries.error ?? offers.error ?? actionError} />

      <form className="panel" data-testid="waitlist-form" onSubmit={submit} noValidate>
        <label>
          Provider
          <select
            data-testid="waitlist-provider-select"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
          >
            <option value="">Any provider</option>
            {providers.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Earliest date
          <input
            type="date"
            data-testid="waitlist-earliest"
            value={earliest}
            onChange={(e) => setEarliest(e.target.value)}
          />
        </label>
        <label>
          Latest date
          <input
            type="date"
            data-testid="waitlist-latest"
            value={latest}
            onChange={(e) => setLatest(e.target.value)}
          />
        </label>
        {formError && (
          <div role="alert" className="error-banner" data-testid="waitlist-error">
            {formError}
          </div>
        )}
        <button type="submit" data-testid="waitlist-submit">
          Join waitlist
        </button>
      </form>

      {!currentPatient && (
        <p className="hint" data-testid="select-patient-hint">
          Select a patient at the top of the page to see their waitlist.
        </p>
      )}

      {offers.data && offers.data.length > 0 && (
        <>
          <h3>Offers</h3>
          <ul className="card-list">
            {offers.data.map((offer) => (
              <OfferCard key={offer.id} offer={offer} now={now} onRespond={respond} />
            ))}
          </ul>
        </>
      )}

      {entries.data && (
        <>
          <h3>Entries</h3>
          {entries.data.length === 0 && <p data-testid="waitlist-empty">Not on the waitlist.</p>}
          <ul className="card-list">
            {entries.data.map((entry) => (
              <li key={entry.id} className="card" data-testid="waitlist-entry">
                <span>
                  {providerName(entry.providerId)} · {formatDateTime(entry.earliestAt)} –{' '}
                  {formatDateTime(entry.latestAt)} ·{' '}
                  <span data-testid="waitlist-status">{entry.status}</span>
                </span>
                {(entry.status === 'active' || entry.status === 'offered') && (
                  <button
                    type="button"
                    data-testid="waitlist-leave"
                    onClick={() => run(() => api.leaveWaitlist(entry.id))}
                  >
                    Leave
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
