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





export default function PatientDashboard() {
  const { logout, user } = useAuth();
  const [file, setFile] = useState(null);
  const [language, setLanguage] = useState('English');
  const [uploading, setUploading] = useState(false);
  const [activeReport, setActiveReport] = useState(null);
  const [toast, setToast] = useState(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([initialAssistantMessage]);

  const sections = useMemo(() => [
    { title: 'Precautions', body: activeReport?.precautions?.join('\n- ') || 'No specific details found in this section yet.' },
    { title: 'Primary Treatments', body: activeReport?.primary_treatments?.join('\n- ') || 'No specific details found in this section yet.' },
    { title: 'When to Seek Clinical Care', body: activeReport?.when_to_seek_clinical_care?.join('\n- ') || 'No specific details found in this section yet.' },
  ], [activeReport]);

  const notify = (message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3600);
  };



  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) {
      notify('Please choose a PDF report before analysis.', 'error');
      return;
    }

    setUploading(true);
    try {
      const response = await medicalAPI.uploadPDF(file, language);
      const analysis = response.data?.report?.medical_summary || 'No analysis returned from the server.';
      const r = response.data?.report || {};
      setActiveReport({ ...r, id: response.data?.report_id });
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
        reportId: activeReport?.id,
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
                Reports
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
                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {activeReport ? `- ${section.body}` : section.body}
                </div>
              </article>
            ))}
          </section>

          {activeReport?.medical_disclaimer && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="text-amber-600 font-bold mt-0.5">!</span>
                <div>
                  <h3 className="text-sm font-black text-amber-900">Medical Disclaimer</h3>
                  <p className="mt-1 text-sm leading-6 text-amber-800">{activeReport.medical_disclaimer}</p>
                </div>
              </div>
            </div>
          )}

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

        </aside>
      </div>
    </div>
  );
}
