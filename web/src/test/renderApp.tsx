import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes, routerFuture } from '../App';
import { CurrentPatientProvider } from '../context/CurrentPatientContext';

/** Render the full app at `path`, optionally with a patient already selected. */
export function renderApp(path: string, { currentPatientId }: { currentPatientId?: string } = {}) {
  if (currentPatientId) localStorage.setItem('clinic.currentPatientId', currentPatientId);
  return render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <CurrentPatientProvider>
        <AppRoutes />
      </CurrentPatientProvider>
    </MemoryRouter>,
  );
}
