import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../api/client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [roleTab, setRoleTab] = useState('patient'); // 'patient' or 'doctor'
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // 1. Authenticate user credentials
      const res = await authAPI.loginUser(email, password);
      const token = res.data.access_token;
      
      // 2. Set token in local storage for interceptor request
      localStorage.setItem('token', token);

      // 3. Fetch user profile from database
      const userRes = await authAPI.getMe();
      const actualRole = userRes.data.role || roleTab; 

      // 4. Role Verification Safeguard
      if (roleTab === 'doctor' && actualRole !== 'doctor') {
        localStorage.removeItem('token');
        setError('This account is not registered as a Doctor. Please select Patient login.');
        setIsLoading(false);
        return;
      }

      // 5. Update Auth Context
      login(token, actualRole, userRes.data);

      // 6. Dynamic Navigation based on role
      if (actualRole === 'doctor') {
        navigate('/doctor-workspace');
      } else {
        navigate('/dashboard');
      }
      
    } catch (err) {
      localStorage.removeItem('token');
      setError(err.response?.data?.detail || 'Invalid credentials provided. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-slate-900 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(14,165,233,0.15),rgba(255,255,255,0))] p-4 sm:p-6 lg:p-8">
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
      </div>

      <header className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-20 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-teal-500/10 text-teal-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-white tracking-tight">
            medi<span className="text-teal-400">-friend</span>
          </span>
        </div>
      </header>

      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-slate-900/20 border border-slate-100 overflow-hidden transition-all duration-300 z-10">
        
        {/* Card Header */}
        <div className="pt-8 pb-6 px-8 text-center border-b border-slate-100 bg-slate-50/50">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-600 mb-3 shadow-inner">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.684a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">
            {roleTab === 'doctor' ? 'Doctor Portal Sign In' : 'Welcome Back'}
          </h1>
          <p className="text-xs font-medium text-slate-500 mt-1">
            {roleTab === 'doctor' ? 'Access clinical workspace & queue' : 'Access your secure patient portal'}
          </p>
        </div>

        <div className="p-8">
          
          {/* ROLE SELECTOR TOGGLE TABS */}
          <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
            <button
              type="button"
              onClick={() => { setRoleTab('patient'); setError(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                roleTab === 'patient'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Patient / Student
            </button>
            <button
              type="button"
              onClick={() => { setRoleTab('doctor'); setError(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                roleTab === 'doctor'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Doctor Portal 🩺
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-3.5 mb-6 bg-rose-50 border border-rose-200/60 rounded-2xl text-xs font-medium text-rose-700 animate-in fade-in slide-in-from-top-2 duration-200">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={roleTab === 'doctor' ? "dr.smith@hospital.com" : "john_doe@example.com"}
                  className="w-full pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all duration-200"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-slate-600">Password</label>
                <a href="#forgot" className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline">Forgot?</a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showPassword ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-7 0-10-7-10-7a18.06 18.06 0 015.42-4.42m3.58-1.08A10.05 10.05 0 0112 5c7 0 10 7 10 7a18.06 18.06 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    )}
                  </svg>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 px-4 rounded-xl text-white font-semibold text-sm shadow-md transition-all duration-200 flex items-center justify-center gap-2 bg-gradient-to-r ${
                roleTab === 'doctor' 
                  ? 'from-teal-700 to-emerald-700 hover:from-teal-600 hover:to-emerald-600' 
                  : 'from-teal-600 to-teal-700 hover:from-teal-500 hover:to-teal-600'
              } ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isLoading ? (
                <span>Authenticating...</span>
              ) : (
                <span>Sign In as {roleTab === 'doctor' ? 'Doctor' : 'Patient'}</span>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              Need a new account? <Link to="/register" className="font-semibold text-teal-600 hover:text-teal-700 hover:underline">Register here</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}