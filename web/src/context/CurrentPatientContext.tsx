import { createContext, useContext, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { Patient } from '../api/types';
import { useApiData } from '../hooks/useApiData';

const STORAGE_KEY = 'clinic.currentPatientId';

interface CurrentPatientValue {
  patients: Patient[];
  currentPatient: Patient | undefined;
  setCurrentPatientId: (id: string) => void;
  reloadPatients: () => void;
}

const CurrentPatientContext = createContext<CurrentPatientValue | null>(null);

/**
 * The patient the front desk is acting for. There is no auth; the header's patient
 * picker sets this, and pages pass `currentPatient.id` to the API as `patientId`.
 */
export function CurrentPatientProvider({ children }: { children: ReactNode }) {
  const { data: patients = [], reload } = useApiData(() => api.listPatients(), []);
  const [currentId, setCurrentId] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '');

  const setCurrentPatientId = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setCurrentId(id);
  };

  return (
    <CurrentPatientContext.Provider
      value={{
        patients,
        currentPatient: patients.find((p) => p.id === currentId),
        setCurrentPatientId,
        reloadPatients: reload,
      }}
    >
      {children}
    </CurrentPatientContext.Provider>
  );
}

export function useCurrentPatient(): CurrentPatientValue {
  const value = useContext(CurrentPatientContext);
  if (!value) throw new Error('useCurrentPatient must be used inside CurrentPatientProvider');
  return value;
}
