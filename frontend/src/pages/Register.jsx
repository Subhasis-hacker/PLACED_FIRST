import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api/client';

export default function Register() {
  const [formData, setFormData] = useState({ 
    username: '', 
    email: '', 
    password: '' 
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    const username = formData.username.trim();
    const email = formData.email.trim().toLowerCase();
    const password = formData.password;

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!username) {
      setError('Username is required.');
      return;
    }

    setSubmitting(true);
    try {
      await authAPI.registerUser({ 
        username, 
        email, 
        password 
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Check parameters.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 w-full max-w-md animate-fadeIn">
        <h2 className="text-2xl font-black text-center mb-6 text-slate-900">Create Account</h2>
        
        {error && <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm mb-4">{error}</div>}
        {success && <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl text-sm mb-4 font-bold">Account created! Redirecting...</div>}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">USERNAME</label>
            <input 
              type="text" 
              required 
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })} 
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition" 
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">EMAIL ADDRESS</label>
            <input 
              type="email" 
              required 
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })} 
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition" 
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">PASSWORD (MINIMUM 8 CHARACTERS)</label>
            <input 
              type="password" 
              required 
              minLength={8}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition" 
              placeholder="At least 8 characters"
            />
          </div>
          
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl mt-2 hover:bg-slate-800 transition shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating Profile...' : 'Register Profile'}
          </button>
        </form>
        
        <p className="text-center text-sm text-slate-400 mt-4">
          <Link to="/login" className="text-blue-500 hover:underline font-bold">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}
