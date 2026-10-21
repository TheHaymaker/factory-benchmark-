import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { CurrentPatientProvider } from './context/CurrentPatientContext';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { PatientsPage } from './pages/PatientsPage';
import { ProviderPage } from './pages/ProviderPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { StaffSchedulePage } from './pages/StaffSchedulePage';
import { StaffWaitlistPage } from './pages/StaffWaitlistPage';
import { WaitlistPage } from './pages/WaitlistPage';

export { future as routerFuture };

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ProvidersPage />} />
        <Route path="providers/:providerId" element={<ProviderPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="waitlist" element={<WaitlistPage />} />
        <Route path="staff/schedule" element={<StaffSchedulePage />} />
        <Route path="staff/waitlist" element={<StaffWaitlistPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

const future = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

export function App() {
  return (
    <BrowserRouter future={future}>
      <CurrentPatientProvider>
        <AppRoutes />
      </CurrentPatientProvider>
    </BrowserRouter>
  );
}
