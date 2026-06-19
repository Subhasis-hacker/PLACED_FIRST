import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/client';

export default function Login() {
  const [activeTab, setActiveTab] = useState('patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (activeTab === 'patient') {
        const res = await authAPI.loginUser(email, password);
        login(res.data.access_token, 'patient', { username: email });
        navigate('/dashboard');
      } else {
        const res = await authAPI.loginDoctor(email, password);
        login(res.data.access_token, 'doctor', res.data.doctor || { email });
        navigate('/doctor-workspace');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid credentials verified.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 w-full max-w-md animate-fadeIn">
        <div className="text-center mb-6">
          <span className="text-3xl">🩺</span>
          <h2 className="text-2xl font-black mt-2 bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">medi-friend Platform</h2>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
          <button onClick={() => setActiveTab('patient')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${activeTab === 'patient' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Patient Portal</button>
          <button onClick={() => setActiveTab('doctor')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition ${activeTab === 'doctor' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>Doctor Hub</button>
        </div>

        {error && <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm mb-4 font-medium">{error}</div>}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">{activeTab === 'patient' ? 'Username' : 'Clinician Email'}</label>
            <input type="text" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition" />
          </div>
          <button type="submit" className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-md transition mt-2">Sign In</button>
        </form>
        <p className="text-center text-sm text-slate-400 mt-6">Need an account? <Link to="/register" className="text-blue-500 font-bold hover:underline">Register here</Link></p>
      </div>
    </div>
  );
}
