import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { medicalAPI } from '../api/client';

const emptyMedication = {
  drug_name: '',
  dosage: '',
  frequency: '',
  duration: '',
};

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const tone = toast.type === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <div className={`fixed right-4 top-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg ${tone}`}>
      <div className="flex items-start gap-3">
        <span>{toast.type === 'error' ? '!' : 'OK'}</span>
        <p className="flex-1">{toast.message}</p>
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-900">x</button>
      </div>
    </div>
  );
}

function Spinner({ className = 'border-white' }) {
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent ${className}`} />;
}

function getErrorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

function formatDate(value) {
  if (!value) return 'New case';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function normalizeMedications(caseItem) {
  if (Array.isArray(caseItem?.prescription) && caseItem.prescription.length > 0) {
    return caseItem.prescription.map((item) => ({ ...emptyMedication, ...item }));
  }
  return [{ ...emptyMedication }];
}

export default function DoctorDashboard() {
  const { logout, user } = useAuth();
  const doctorEmail = user?.email || localStorage.getItem('userEmail') || '';
  const [queue, setQueue] = useState([]);
  const [activeCase, setActiveCase] = useState(null);
  const [medications, setMedications] = useState([{ ...emptyMedication }]);
  const [remarks, setRemarks] = useState('');
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [toast, setToast] = useState(null);

  const prescriptionPayload = useMemo(() => ({
    medications: medications.map((item) => ({
      drug_name: item.drug_name.trim(),
      dosage: item.dosage.trim(),
      frequency: item.frequency.trim(),
      duration: item.duration.trim(),
    })),
    remarks,
  }), [medications, remarks]);

  const notify = (message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3600);
  };

  const fetchQueue = async () => {
    if (!doctorEmail) return;
    setLoadingQueue(true);
    try {
      const response = await medicalAPI.getDoctorQueue(doctorEmail);
      setQueue(response.data || []);
      if (activeCase) {
        const updatedActive = response.data?.find((item) => item.id === activeCase.id);
        if (updatedActive) setActiveCase(updatedActive);
      }
    } catch (error) {
      notify(getErrorMessage(error, 'Failed to load the clinician queue.'), 'error');
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [doctorEmail]);

  const selectCase = (caseItem) => {
    setActiveCase(caseItem);
    setMedications(normalizeMedications(caseItem));
    setRemarks(caseItem.clinical_remarks || '');
  };

  const updateMedication = (index, field, value) => {
    setMedications((prev) => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };

  const addMedication = () => {
    setMedications((prev) => [...prev, { ...emptyMedication }]);
  };

  const removeMedication = (index) => {
    setMedications((prev) => (
      prev.length === 1 ? [{ ...emptyMedication }] : prev.filter((_, itemIndex) => itemIndex !== index)
    ));
  };

  const savePrescription = async ({ quiet = false } = {}) => {
    if (!activeCase) return false;
    setSaving(true);
    try {
      const response = await medicalAPI.updatePrescription(activeCase.id, prescriptionPayload);
      setActiveCase(response.data.case);
      setQueue((prev) => prev.map((item) => (item.id === activeCase.id ? response.data.case : item)));
      if (!quiet) notify('Prescription draft saved.');
      return true;
    } catch (error) {
      notify(getErrorMessage(error, 'Unable to save prescription edits.'), 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const approveCase = async () => {
    if (!activeCase) return;
    setApproving(true);
    try {
      await medicalAPI.updatePrescription(activeCase.id, prescriptionPayload);
      await medicalAPI.approveCase(activeCase.id, prescriptionPayload);
      notify('Prescription approved, signed, and transmitted.');
      setQueue((prev) => prev.filter((item) => item.id !== activeCase.id));
      setActiveCase(null);
      setMedications([{ ...emptyMedication }]);
      setRemarks('');
    } catch (error) {
      notify(getErrorMessage(error, 'Approval failed. Please review the case and try again.'), 'error');
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-600">medi-friend clinician workspace</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">Clinical Review Queue</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden rounded-lg bg-slate-50 px-4 py-2 text-right sm:block">
              <p className="text-sm font-black text-slate-900">{doctorEmail || 'Doctor'}</p>
              <p className="text-xs font-semibold text-slate-500">Verified clinician access</p>
            </div>
            <button onClick={logout} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-5 p-4 lg:grid-cols-[320px_minmax(0,1fr)_430px] xl:p-6">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 p-5">
            <div>
              <h2 className="text-base font-black text-slate-950">The Queue</h2>
              <p className="text-sm font-medium text-slate-500">{queue.length} pending cases</p>
            </div>
            <button onClick={fetchQueue} className="rounded-md bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 hover:bg-indigo-100">
              {loadingQueue ? 'Loading' : 'Refresh'}
            </button>
          </div>

          <div className="max-h-[calc(100vh-190px)] space-y-3 overflow-y-auto p-4">
            {loadingQueue && (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-slate-50 p-5 text-sm font-bold text-slate-500">
                <Spinner className="border-indigo-600" />
                Loading queue
              </div>
            )}
            {!loadingQueue && queue.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
                <p className="text-sm font-bold text-slate-500">No active cases are waiting.</p>
              </div>
            )}
            {queue.map((caseItem) => (
              <button
                key={caseItem.id}
                type="button"
                onClick={() => selectCase(caseItem)}
                className={`w-full rounded-lg border p-4 text-left transition ${activeCase?.id === caseItem.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{caseItem.patient_name || `Patient #${caseItem.user_id}`}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(caseItem.created_at)}</p>
                  </div>
                  <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-black text-indigo-700">
                    {caseItem.patient_language || 'English'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="min-h-[620px] rounded-lg border border-slate-200 bg-white shadow-sm">
          {activeCase ? (
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-200 p-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Case context</p>
                    <h2 className="mt-1 text-2xl font-black text-slate-950">{activeCase.patient_name || 'Patient Evaluation'}</h2>
                    <p className="mt-1 text-sm font-medium text-slate-500">Case #{activeCase.id} · {activeCase.uploaded_filename || 'Uploaded PDF data'} · {activeCase.patient_language}</p>
                  </div>
                  <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                    {activeCase.status}
                  </span>
                </div>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-5">
                <article>
                  <h3 className="text-sm font-black text-slate-950">Original Uploaded Data</h3>
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                    <p><span className="font-bold text-slate-900">Filename:</span> {activeCase.uploaded_filename || 'Not supplied'}</p>
                    <p><span className="font-bold text-slate-900">Requested language:</span> {activeCase.patient_language || 'English'}</p>
                    <p><span className="font-bold text-slate-900">Submitted:</span> {formatDate(activeCase.created_at)}</p>
                  </div>
                </article>

                <article>
                  <h3 className="text-sm font-black text-slate-950">AI Structural Health Analysis</h3>
                  <div className="mt-3 max-h-[420px] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    <p className="whitespace-pre-wrap">{activeCase.ai_analysis || activeCase.ai_generated_draft}</p>
                  </div>
                </article>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[620px] items-center justify-center p-8 text-center">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-indigo-600">No case selected</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Choose a patient from the queue</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">The AI report and uploaded case context will appear here for clinical verification.</p>
              </div>
            </div>
          )}
        </section>

        <section className="relative rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Editable prescription</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Doctor Recommendations</h2>
          </div>

          {activeCase ? (
            <div className="pb-28">
              <div className="space-y-4 p-5">
                {medications.map((medication, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-black text-slate-950">Medication {index + 1}</p>
                      <button
                        type="button"
                        onClick={() => removeMedication(index)}
                        className="rounded-md bg-white px-3 py-1.5 text-xs font-black text-rose-600 shadow-sm hover:bg-rose-50"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input value={medication.drug_name} onChange={(event) => updateMedication(index, 'drug_name', event.target.value)} placeholder="Drug Name" className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none" />
                      <input value={medication.dosage} onChange={(event) => updateMedication(index, 'dosage', event.target.value)} placeholder="Dosage" className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none" />
                      <input value={medication.frequency} onChange={(event) => updateMedication(index, 'frequency', event.target.value)} placeholder="Frequency" className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none" />
                      <input value={medication.duration} onChange={(event) => updateMedication(index, 'duration', event.target.value)} placeholder="Duration" className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none" />
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addMedication}
                  className="w-full rounded-lg border border-dashed border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-700 transition hover:bg-indigo-100"
                >
                  Add Medication
                </button>

                <div>
                  <label className="text-sm font-black text-slate-950">Clinical Remarks</label>
                  <textarea
                    value={remarks}
                    onChange={(event) => setRemarks(event.target.value)}
                    rows={6}
                    placeholder="Add precautions, follow-up timing, diagnostic advice, or referral notes."
                    className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm leading-6 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 p-4 backdrop-blur">
                <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
                  <button
                    type="button"
                    onClick={() => savePrescription()}
                    disabled={saving || approving}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    {saving && <Spinner className="border-indigo-600" />}
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={approveCase}
                    disabled={saving || approving}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {approving && <Spinner />}
                    Approve, Sign & Transmit
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-sm leading-6 text-slate-500">
              Select a case to edit medications, dosage, frequency, duration, and clinical remarks.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
