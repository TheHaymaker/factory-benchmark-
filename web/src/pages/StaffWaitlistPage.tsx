import { useState } from 'react';
import { api } from '../api/client';
import type { Slot, StaffWaitlistEntry } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { useApiData } from '../hooks/useApiData';
import { useNow } from '../hooks/useNow';
import { formatDateTime, formatDuration } from '../lib/format';

interface SlotChoice {
  slot: Slot;
  providerName: string;
}

/** Open slots for the entry's provider, or for every provider for any-provider entries. */
async function loadSlotChoices(entry: StaffWaitlistEntry): Promise<SlotChoice[]> {
  const providers = await api.listProviders();
  const relevant = providers.filter((p) => entry.providerId === null || p.id === entry.providerId);
  const lists = await Promise.all(
    relevant.map(async (p) =>
      (await api.listAvailableSlots(p.id)).map((slot) => ({ slot, providerName: p.name })),
    ),
  );
  return lists.flat().sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt));
}

function OfferForm({ entry, onOffered }: { entry: StaffWaitlistEntry; onOffered: () => void }) {
  const choices = useApiData(() => loadSlotChoices(entry), [entry.id]);
  const [slotId, setSlotId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    if (!slotId) return setError('Choose a slot to offer.');
    try {
      await api.createStaffOffer({ entryId: entry.id, slotId });
      onOffered();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <span>
      <select
        data-testid="staff-offer-slot-select"
        value={slotId}
        onChange={(e) => setSlotId(e.target.value)}
      >
        <option value="">Choose a slot…</option>
        {choices.data?.map(({ slot, providerName }) => (
          <option key={slot.id} value={slot.id}>
            {providerName} · {formatDateTime(slot.startsAt)}
          </option>
        ))}
      </select>{' '}
      <button type="button" data-testid="staff-offer-confirm" onClick={confirm}>
        Offer
      </button>
      {(error ?? choices.error) && (
        <div role="alert" className="error-banner" data-testid="staff-offer-error">
          {error ?? choices.error?.message}
        </div>
      )}
    </span>
  );
}

export function StaffWaitlistPage() {
  const entries = useApiData(() => api.listStaffWaitlist(), []);
  const now = useNow(30_000);
  const [offeringId, setOfferingId] = useState<string | null>(null);

  return (
    <section>
      <h2>Staff: waitlist</h2>
      <ErrorBanner error={entries.error} />
      {entries.data?.length === 0 && <p data-testid="staff-waitlist-empty">Nobody is waiting.</p>}
      <table data-testid="staff-waitlist-table">
        <tbody>
          {entries.data?.map((entry) => (
            <tr key={entry.id} data-testid="staff-waitlist-row">
              <td>{entry.patientName}</td>
              <td>{entry.providerName ?? 'Any provider'}</td>
              <td>{entry.status}</td>
              <td>waiting {formatDuration(now - Date.parse(entry.createdAt))}</td>
              <td>
                {entry.status === 'active' &&
                  (offeringId === entry.id ? (
                    <OfferForm
                      entry={entry}
                      onOffered={() => {
                        setOfferingId(null);
                        entries.reload();
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      data-testid="staff-offer-button"
                      onClick={() => setOfferingId(entry.id)}
                    >
                      Offer a slot
                    </button>
                  ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
