import { notFound } from '../lib/errors.js';
import type { Provider } from '../domain/types.js';
import type { ProviderRepository } from '../repositories/providerRepository.js';

export class ProviderService {
  constructor(private readonly providers: ProviderRepository) {}

  list(): Provider[] {
    return this.providers.list();
  }

  /** @throws 404 NOT_FOUND */
  get(id: string): Provider {
    const provider = this.providers.findById(id);
    if (!provider) throw notFound('Provider', id);
    return provider;
  }
}
