import { NavLink, Outlet } from 'react-router-dom';
import { useCurrentPatient } from '../context/CurrentPatientContext';

export function Layout() {
  const { patients, currentPatient, setCurrentPatientId } = useCurrentPatient();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Clinic Scheduler</h1>
        <nav>
          <NavLink to="/" end data-testid="nav-providers">
            Book
          </NavLink>
          <NavLink to="/appointments" data-testid="nav-appointments">
            My appointments
          </NavLink>
          <NavLink to="/waitlist" data-testid="nav-waitlist">
            Waitlist
          </NavLink>
          <NavLink to="/patients" data-testid="nav-patients">
            Patients
          </NavLink>
          <NavLink to="/staff/schedule" data-testid="nav-staff-schedule">
            Staff: schedule
          </NavLink>
          <NavLink to="/staff/waitlist" data-testid="nav-staff-waitlist">
            Staff: waitlist
          </NavLink>
        </nav>
        <label className="current-patient">
          Acting as{' '}
          <select
            data-testid="current-patient-select"
            value={currentPatient?.id ?? ''}
            onChange={(e) => setCurrentPatientId(e.target.value)}
          >
            <option value="">Select a patient…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
