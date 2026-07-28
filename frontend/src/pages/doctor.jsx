import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Star, Users, MapPin, Mail, Clock, ShieldCheck, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// Import the API client
import { doctorDashboardAPI } from '../api/client';

export default function DoctorWorkspace({ doctorId: propDoctorId }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Dynamically resolve doctor ID from AuthContext or fallback to prop/1
  const doctorId = user?.doctor_id || user?.id || propDoctorId || 1;

  const [analytics, setAnalytics] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Using Axios client; tokens are handled automatically by interceptors
      const [resAnalytics, resQueue] = await Promise.all([
        doctorDashboardAPI.getAnalytics(doctorId),
        doctorDashboardAPI.getQueue(doctorId)
      ]);

      // Axios returns parsed JSON inside the .data object
      setAnalytics(resAnalytics.data);
      setQueue(resQueue.data);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      setError('Unable to connect to backend server or load queue.');
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-950 min-h-screen flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-sm font-medium">Loading Doctor Portal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 lg:p-10 space-y-8">
      
      {/* Navbar / Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-xl"
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-2xl">
            {(analytics?.name || user?.username || "D")?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-white">
                {analytics?.name || user?.username || "Dr. Practitioner"}
              </h1>
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-sm text-slate-400 flex items-center gap-3 mt-1">
              <span className="text-indigo-400 font-semibold">{analytics?.specialty || "General Specialist"}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {analytics?.city || "Medical Center"}
              </span>
            </p>
          </div>
        </div>

        {/* Live Lifetime Analytics & Actions */}
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-xl min-w-[130px]">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Patients Helped</p>
            <div className="flex items-center gap-2 mt-1">
              <Users className="w-5 h-5 text-emerald-400" />
              <span className="text-2xl font-black text-white">{analytics?.total_patients_checked ?? 0}</span>
            </div>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-xl min-w-[130px]">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Rating</p>
            <div className="flex items-center gap-2 mt-1">
              <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
              <span className="text-2xl font-black text-white">{analytics?.average_rating ?? "N/A"}</span>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="p-4 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl transition flex items-center justify-center gap-2 text-xs font-bold"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </motion.div>

      {/* Backend Error Banner */}
      {error && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={fetchDashboardData} className="underline font-bold hover:text-amber-200">
            Retry Connection
          </button>
        </div>
      )}

      {/* Active Patients Queue for Today */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-400" /> Today's Active Patient Queue
          </h2>
          <span className="text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-3 py-1 rounded-full font-bold">
            {queue.length} Patients Scheduled
          </span>
        </div>

        {queue.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
            No active patient bookings remaining in queue for today.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {queue.map((item, idx) => (
              <motion.div
                key={item.booking_id || idx}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: idx * 0.05 }}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-5 rounded-2xl space-y-4 transition-all shadow-lg"
              >
                <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" /> {item.time_slot}
                  </span>
                  <span className="bg-indigo-600 text-white font-extrabold text-sm px-3 py-1 rounded-lg shadow-sm">
                    Token #{item.token_number}
                  </span>
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-lg text-white">{item.patient_name}</h3>
                  <div className="text-xs text-slate-400 space-y-1">
                    {item.patient_city && (
                      <p className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" /> {item.patient_city}
                      </p>
                    )}
                    {item.patient_email && (
                      <p className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-500" /> {item.patient_email}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}