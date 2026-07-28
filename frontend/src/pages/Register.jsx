import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI, doctorAuthAPI } from '../api/client';

const SPECIALTIES = ["OPD", "General Surgery", "Cardiology", "Neurology", "Oncology"];

export default function Register() {
  const [role, setRole] = useState('patient');
  const [formData, setFormData] = useState({
    // Shared
    email: '',
    password: '',
    // Patient specific
    username: '',
    // Doctor specific
    name: '',
    specialty: SPECIALTIES[0],
    city: '',
    phone: '',
  });
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    const email = formData.email.trim().toLowerCase();
    const password = formData.password;

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      if (role === 'patient') {
        const username = formData.username.trim();
        if (!username) {
          setError('Username is required for patients.');
          setSubmitting(false);
          return;
        }
        // Route to standard user/patient registration
        await authAPI.registerUser({
          username,
          email,
          password,
          role: 'patient',
        });
      } else {
        const name = formData.name.trim();
        if (!name || !formData.city || !formData.phone) {
          setError('Please fill in all clinical details.');
          setSubmitting(false);
          return;
        }
        // Route to dedicated doctor registration
        await doctorAuthAPI.registerDoctor({
          name,
          email,
          password,
          specialty: formData.specialty,
          city: formData.city.trim(),
          phone: formData.phone.trim(),
        });
      }

      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      const errorMsg = err.response?.data?.detail;
      setError(typeof errorMsg === 'string' ? errorMsg : 'Registration failed. Check parameters or email might already be in use.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-12">
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 w-full max-w-md animate-fadeIn">
        <h2 className="text-2xl font-black text-center mb-6 text-slate-900">
          Create Account
        </h2>
        
        {error && <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm mb-4">{error}</div>}
        {success && <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl text-sm mb-4 font-bold">Account created! Redirecting to Login...</div>}

        <form onSubmit={handleRegister} className="space-y-4">
          
          {/* ROLE SELECTOR */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">I AM A...</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('patient')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                  role === 'patient' 
                    ? 'bg-blue-50 border-blue-500 text-blue-600' 
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                Patient / Student
              </button>
              <button
                type="button"
                onClick={() => setRole('doctor')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all ${
                  role === 'doctor' 
                    ? 'bg-teal-50 border-teal-500 text-teal-700' 
                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                Doctor / Specialist
              </button>
            </div>
          </div>

          {/* SHARED FIELDS */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">EMAIL ADDRESS</label>
            <input 
              type="email" 
              name="email"
              required 
              value={formData.email}
              onChange={handleInputChange} 
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition" 
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">PASSWORD (MIN 8 CHARACTERS)</label>
            <input 
              type="password" 
              name="password"
              required 
              minLength={8}
              value={formData.password}
              onChange={handleInputChange} 
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition" 
              placeholder="At least 8 characters"
            />
          </div>

          {/* PATIENT SPECIFIC FIELDS */}
          {role === 'patient' && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <label className="block text-xs font-bold text-slate-500 mb-1">USERNAME</label>
              <input 
                type="text"
                name="username" 
                required={role === 'patient'} 
                value={formData.username}
                onChange={handleInputChange} 
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 transition" 
              />
            </div>
          )}

          {/* DOCTOR SPECIFIC FIELDS */}
          {role === 'doctor' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">FULL NAME (WITH TITLE)</label>
                <input 
                  type="text" 
                  name="name"
                  placeholder="e.g. Dr. Jane Smith"
                  required={role === 'doctor'} 
                  value={formData.name}
                  onChange={handleInputChange} 
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 transition" 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">MEDICAL SPECIALTY</label>
                <select 
                  name="specialty"
                  value={formData.specialty}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 transition bg-white"
                >
                  {SPECIALTIES.map(spec => (
                    <option key={spec} value={spec}>{spec}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">CITY / LOCATION</label>
                  <input 
                    type="text" 
                    name="city"
                    required={role === 'doctor'} 
                    value={formData.city}
                    onChange={handleInputChange} 
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 transition" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">PHONE NUMBER</label>
                  <input 
                    type="tel" 
                    name="phone"
                    required={role === 'doctor'} 
                    value={formData.phone}
                    onChange={handleInputChange} 
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 transition" 
                  />
                </div>
              </div>
            </div>
          )}
          
          <button
            type="submit"
            disabled={submitting}
            className={`w-full py-3 text-white font-bold rounded-xl mt-4 transition shadow-sm disabled:cursor-not-allowed disabled:opacity-60 ${
              role === 'doctor' ? 'bg-teal-700 hover:bg-teal-800' : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {submitting ? 'Creating Profile...' : 'Register Profile'}
          </button>
        </form>
        
        <p className="text-center text-sm text-slate-400 mt-6 border-t border-slate-100 pt-4">
          Already have an account? <Link to="/login" className="text-blue-500 hover:underline font-bold">Sign In here</Link>
        </p>
      </div>
    </div>
  );
}