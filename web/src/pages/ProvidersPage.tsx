import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { ErrorBanner } from '../components/ErrorBanner';
import { useApiData } from '../hooks/useApiData';

export function ProvidersPage() {
  const { data: providers, error, loading } = useApiData(() => api.listProviders(), []);

  return (
    <section>
      <h2>Choose a provider</h2>
      <ErrorBanner error={error} />
      {loading && <p>Loading…</p>}
      <ul className="card-list" data-testid="provider-list">
        {providers?.map((provider) => (
          <li key={provider.id} className="card">
            <Link to={`/providers/${provider.id}`} data-testid={`provider-link-${provider.id}`}>
              {provider.name}
            </Link>
            <span className="muted"> · {provider.specialty}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
