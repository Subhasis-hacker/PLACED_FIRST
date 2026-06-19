import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { medicalAPI } from '../api/client';
import BmiCalculator from '../components/BmiCalculator';

const languages = ['English', 'Hindi', 'Odia'];

const initialAssistantMessage = {
  role: 'assistant',
  content: 'Good day. I am Medi, your formal medical support assistant. Please upload your report or ask a health-related question, and I will explain the information clearly while advising appropriate doctor follow-up.',
};

function cleanChatText(text) {
  return String(text || '')
    .replace(/\\n|\n|\r|\t/g, ' ')
    .replace(/[{}[\]"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function MediDoll() {
  return (
    <div className="relative h-16 w-16 shrink-0">
      <div className="absolute left-1/2 top-1 h-12 w-12 -translate-x-1/2 rounded-full border border-blue-100 bg-blue-50 shadow-sm">
        <div className="absolute left-3 top-5 h-1.5 w-1.5 rounded-full bg-slate-700" />
        <div className="absolute right-3 top-5 h-1.5 w-1.5 rounded-full bg-slate-700" />
        <div className="absolute left-1/2 top-8 h-1 w-5 -translate-x-1/2 rounded-full bg-rose-300" />
      </div>
      <div className="absolute bottom-0 left-1/2 h-8 w-12 -translate-x-1/2 rounded-t-xl border border-slate-200 bg-white shadow-sm" />
      <div className="absolute bottom-4 left-5 h-6 w-6 rounded-b-full border-b-2 border-l-2 border-r-2 border-blue-600" />
      <div className="absolute bottom-3 right-4 h-2.5 w-2.5 rounded-full border-2 border-blue-600 bg-white" />
    </div>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;

  const tone = toast.type === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <div className={`fixed right-4 top-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg ${tone}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5">{toast.type === 'error' ? '!' : 'OK'}</span>
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

function splitAnalysisSections(content) {
  const headings = [
    'Diagnosis Breakdown',
    'Key Health Metrics',
    'Recommended Next Steps',
  ];

  if (!content) {
    return headings.map((title) => ({ title, body: 'Analysis will appear here after upload.' }));
  }

  const normalized = content
    .replace(/📋|📊|🛡️|###/g, '')
    .replace(/DIAGNOSIS BREAKDOWN/gi, 'Diagnosis Breakdown')
    .replace(/KEY HEALTH METRICS/gi, 'Key Health Metrics')
    .replace(/RECOMMENDED NEXT STEPS/gi, 'Recommended Next Steps');

  return headings.map((title, index) => {
    const start = normalized.indexOf(title);
    const next = headings[index + 1] ? normalized.indexOf(headings[index + 1]) : -1;
    const body = start >= 0
      ? normalized.slice(start + title.length, next > start ? next : undefined).trim()
      : (index === 0 ? normalized.trim() : 'No specific details found in this section yet.');
    return { title, body: body || 'No specific details found in this section yet.' };
  });
}

function StatusStepper({ status }) {
  const steps = [
    { key: 'drafted', label: 'Drafted' },
    { key: 'sent', label: 'Sent to Doctor' },
    { key: 'under_review', label: 'Under Review' },
    { key: 'approved', label: 'Approved' },
  ];

  const activeIndex = status === 'approved' ? 3 : status === 'under_review' ? 2 : status === 'sent' ? 1 : status === 'drafted' ? 0 : -1;

  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
        const active = index <= activeIndex;
        return (
          <div key={step.key} className="flex items-center gap-3">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-bold ${active ? 'text-slate-900' : 'text-slate-400'}`}>{step.label}</p>
              {index < steps.length - 1 && <div className={`mt-2 h-6 w-px ${index < activeIndex ? 'bg-blue-200' : 'bg-slate-200'}`} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PatientDashboard() {
  const { logout, user } = useAuth();
  const [file, setFile] = useState(null);
  const [language, setLanguage] = useState('English');
  const [uploading, setUploading] = useState(false);
  const [routing, setRouting] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [ragContent, setRagContent] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [cases, setCases] = useState([]);
  const [toast, setToast] = useState(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([initialAssistantMessage]);

  const activeCase = cases[0] || null;
  const localStatus = activeCase?.status || (ragContent ? 'drafted' : '');
  const sections = useMemo(() => splitAnalysisSections(ragContent), [ragContent]);

  const notify = (message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3600);
  };

  const refreshCases = async () => {
    try {
      const response = await medicalAPI.getPatientCases();
      setCases(response.data || []);
    } catch (error) {
      notify(getErrorMessage(error, 'Unable to refresh your case status right now.'), 'error');
    }
  };

  useEffect(() => {
    refreshCases();
  }, []);

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) {
      notify('Please choose a PDF report before analysis.', 'error');
      return;
    }

    setUploading(true);
    try {
      const response = await medicalAPI.uploadPDF(file, language);
      const analysis = response.data?.rag_response || 'No analysis returned from the server.';
      setRagContent(analysis);
      setChatHistory([
        initialAssistantMessage,
        { role: 'user', content: `Uploaded ${file.name} for ${language} analysis.` },
        { role: 'assistant', content: analysis },
      ]);
      notify('Medical report analyzed successfully.');
    } catch (error) {
      notify(getErrorMessage(error, 'Error parsing your medical report.'), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!chatMessage.trim()) return;

    const userMessage = { role: 'user', content: chatMessage.trim() };
    const apiHistory = [...chatHistory, userMessage];
    setChatHistory(apiHistory);
    setChatMessage('');
    setChatLoading(true);

    try {
      const response = await medicalAPI.chat({
        message: userMessage.content,
        history: chatHistory.map((item) => ({ role: item.role, content: cleanChatText(item.content) })),
        language,
        context: cleanChatText(ragContent),
      });
      const assistantMessage = {
        role: 'assistant',
        content: cleanChatText(response.data?.reply || 'I reviewed that. Please continue with any follow-up details.'),
      };
      setChatHistory((prev) => [...prev, assistantMessage]);
    } catch (error) {
      setChatHistory((prev) => [...prev, { role: 'assistant', content: 'I could not reach the AI advisor. Please try again.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleRouteToDoctor = async (event) => {
    event.preventDefault();
    if (!ragContent) {
      notify('Analyze a PDF before forwarding the case.', 'error');
      return;
    }

    setRouting(true);
    try {
      const response = await medicalAPI.forwardCase({
        doctorEmail,
        aiAnalysis: ragContent,
        language,
        uploadedFilename: file?.name,
      });
      setCases((prev) => [response.data.case, ...prev]);
      notify('Case data forwarded to your doctor.');
    } catch (error) {
      notify(getErrorMessage(error, 'Workflow transmission error.'), 'error');
    } finally {
      setRouting(false);
    }
  };

  const handleDownload = async (caseId) => {
    setDownloadingId(caseId);
    try {
      const response = await medicalAPI.downloadPrescription(caseId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `medi_friend_prescription_${caseId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      notify('Signed prescription downloaded.');
    } catch (error) {
      notify(getErrorMessage(error, 'Prescription download is not available yet.'), 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="flex flex-col justify-between border-b border-slate-200 bg-white p-5 lg:border-b-0 lg:border-r">
          <div>
            <div className="mb-8">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">medi-friend</p>
              <h1 className="mt-2 text-2xl font-black text-slate-950">Patient Care</h1>
            </div>
            <nav className="space-y-2">
              <button className="flex w-full items-center gap-3 rounded-lg bg-blue-50 px-4 py-3 text-left text-sm font-bold text-blue-700">
                <span>01</span>
                Consultation
              </button>
              <button className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-semibold text-slate-500">
                <span>02</span>
                Prescriptions
              </button>
            </nav>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-5">
            <div className="mb-4 rounded-lg bg-slate-50 p-4">
              <p className="truncate text-sm font-black text-slate-900">{user?.username || 'Patient'}</p>
              <p className="truncate text-xs font-medium text-slate-500">{user?.email || 'Secure patient account'}</p>
            </div>
            <button onClick={logout} className="w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800">
              Log Out
            </button>
          </div>
        </aside>

        <main className="min-w-0 space-y-6 p-4 sm:p-6 xl:p-8">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">AI triage intake</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Upload medical PDF</h2>
              </div>
              <div className="flex flex-wrap gap-2 rounded-lg bg-slate-100 p-1">
                {languages.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setLanguage(item)}
                    className={`rounded-md px-4 py-2 text-sm font-bold transition ${language === item ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleUpload} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-blue-700 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={uploading}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading && <Spinner />}
                {uploading ? 'Analyzing' : 'Analyze Report'}
              </button>
            </form>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            {sections.map((section) => (
              <article key={section.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-black text-slate-950">{section.title}</h3>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{section.body}</div>
              </article>
            ))}
          </section>

          <section className="flex h-[560px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-4">
                <MediDoll />
                <div>
                  <h3 className="text-sm font-black text-slate-950">Medi Clinical Chatbot</h3>
                  <p className="text-xs font-medium text-slate-500">Formal one-paragraph responses in {language}</p>
                </div>
              </div>
              {chatLoading && <Spinner className="border-blue-600" />}
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {chatHistory.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[86%] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm ${message.role === 'user' ? 'bg-blue-600 text-white' : 'border border-slate-100 bg-slate-50 text-slate-700'}`}>
                    <p>{cleanChatText(message.content)}</p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendMessage} className="grid gap-2 border-t border-slate-200 p-4 sm:grid-cols-[1fr_auto]">
              <input
                value={chatMessage}
                onChange={(event) => setChatMessage(event.target.value)}
                placeholder="Ask a question about your report"
                className="rounded-lg border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button disabled={chatLoading} className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60">
                Send
              </button>
            </form>
          </section>
        </main>

        <aside className="space-y-5 border-t border-slate-200 bg-slate-50 p-4 sm:p-6 lg:border-l lg:border-t-0">
          <BmiCalculator />

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-black text-slate-950">Case Routing</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Forward the AI draft to your doctor's clinical email.</p>
            <form onSubmit={handleRouteToDoctor} className="mt-4 space-y-3">
              <input
                type="email"
                required
                value={doctorEmail}
                onChange={(event) => setDoctorEmail(event.target.value)}
                placeholder="doctor@hospital.com"
                className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                disabled={routing || !ragContent}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {routing && <Spinner />}
                Forward Case Data
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-950">Live Status</h3>
              <button onClick={refreshCases} className="text-xs font-black text-blue-600 hover:text-blue-700">Refresh</button>
            </div>
            <StatusStepper status={localStatus} />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-black text-slate-950">Download Gateway</h3>
            <div className="mt-4 space-y-3">
              {cases.length === 0 && <p className="text-sm leading-6 text-slate-500">Your approved prescription will unlock here after doctor review.</p>}
              {cases.map((item) => (
                <div key={item.case_id || item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">Case #{item.case_id || item.id}</p>
                      <p className="truncate text-xs font-semibold text-slate-500">{item.doctor_email || 'Doctor assigned'}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {item.status}
                    </span>
                  </div>
                  {item.status === 'approved' && (
                    <button
                      onClick={() => handleDownload(item.case_id || item.id)}
                      disabled={downloadingId === (item.case_id || item.id)}
                      className="mt-3 inline-flex w-full animate-pulse items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-md transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      {downloadingId === (item.case_id || item.id) && <Spinner />}
                      Download Signed Prescription
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
