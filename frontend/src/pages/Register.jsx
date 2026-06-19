import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api/client';

export default function Register() {
  const [role, setRole] = useState('patient');
  const [formData, setFormData] = useState({ 
    username: '', 
    name: '', 
    email: '', 
    password: '' 
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    try {
      if (role === 'patient') {
        await authAPI.registerUser({ 
          username: formData.username, 
          email: formData.email, 
          password: formData.password 
        });
      } else {
        // FORCE EXACT ALIGNMENT WITH YOUR BACKEND METHOD EXPECTATIONS
        const doctorPayload = {
          name: formData.name, // ◄--- CRITICAL: Must be exactly 'name'
          email: formData.email, 
          password: formData.password 
        };
        
        console.log("Sending payload to backend:", doctorPayload); // Clean verification checkpoint
        await authAPI.registerDoctor(doctorPayload);
      }
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Check parameters.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 w-full max-w-md animate-fadeIn">
        <h2 className="text-2xl font-black text-center mb-2 text-slate-900">Create Account</h2>
        
        {/* ROLE TOGGLE */}
        <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
          <button 
            type="button" 
            onClick={() => setRole('patient')} 
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${role === 'patient' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
          >
            Patient Registry
          </button>
          <button 
            type="button" 
            onClick={() => setRole('doctor')} 
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${role === 'doctor' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
          >
            Doctor Registry
          </button>
        </div>

        {error && <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm mb-4">{error}</div>}
        {success && <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl text-sm mb-4 font-bold">Account created! Redirecting...</div>}

        <form onSubmit={handleRegister} className="space-y-4">
          {role === 'patient' ? (
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
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">FULL NAME (DR. PREFIX)</label>
              <input 
                type="text" 
                required 
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition" 
              />
            </div>
          )}
          
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
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition" 
              placeholder="At least 8 characters"
            />
          </div>
          
          <button type="submit" className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl mt-2 hover:bg-slate-800 transition shadow-sm">
            Register Profile
          </button>
        </form>
        
        <p className="text-center text-sm text-slate-400 mt-4">
          <Link to="/login" className="text-blue-500 hover:underline font-bold">Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}