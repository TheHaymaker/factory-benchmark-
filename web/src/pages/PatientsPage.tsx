import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { ErrorBanner } from '../components/ErrorBanner';
import { useCurrentPatient } from '../context/CurrentPatientContext';

export function PatientsPage() {
  const { patients, reloadPatients, setCurrentPatientId } = useCurrentPatient();
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState<Error | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const patient = await api.createPatient({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
      });
      setForm({ name: '', email: '', phone: '' });
      reloadPatients();
      setCurrentPatientId(patient.id);
    } catch (err) {
      setError(err as Error);
    }
  };

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <section>
      <h2>Patients</h2>
      <table data-testid="patient-list">
        <tbody>
          {patients.map((patient) => (
            <tr key={patient.id} data-testid={`patient-row-${patient.id}`}>
              <td>{patient.name}</td>
              <td>{patient.email}</td>
              <td>{patient.phone ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Register a patient</h3>
      <form className="panel" onSubmit={submit} data-testid="patient-form">
        <ErrorBanner error={error} />
        <label>
          Name
          <input data-testid="patient-name-input" required {...field('name')} />
        </label>
        <label>
          Email
          <input data-testid="patient-email-input" type="email" required {...field('email')} />
        </label>
        <label>
          Phone (optional)
          <input data-testid="patient-phone-input" {...field('phone')} />
        </label>
        <button type="submit" data-testid="patient-submit">
          Register
        </button>
      </form>
    </section>
  );
}
