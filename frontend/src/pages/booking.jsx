import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Star, MapPin, Calendar, Clock, CheckCircle2, User, ChevronRight } from 'lucide-react';

const SPECIALTIES = ["OPD", "General Surgery", "Cardiology", "Neurology", "Oncology"];
const TIME_SLOTS = ["09:00 AM", "10:30 AM", "02:00 PM", "03:30 PM", "05:00 PM"];

export default function BookingFlow({ patientId = 1 }) {
  const [selectedSpecialty, setSelectedSpecialty] = useState("Cardiology");
  const [cityInput, setCityInput] = useState("");
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [bookingConfirmed, setBookingConfirmed] = useState(null);

  // 1. Query backend for specialty + city sorted by rating DESC
  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!cityInput) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/doctors/search?specialty=${encodeURIComponent(selectedSpecialty)}&city=${encodeURIComponent(cityInput)}`);
      const data = await res.json();
      setDoctors(data);
    } catch (err) {
      console.error("Failed to fetch doctors:", err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Submit booking & receive atomic sequential token number
  const handleBookSlot = async () => {
    if (!selectedDoctor || !selectedSlot) return;
    try {
      const res = await fetch("http://localhost:8000/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctor_id: selectedDoctor.id,
          patient_id: patientId,
          booking_date: new Date().toISOString().split('T')[0],
          time_slot: selectedSlot
        })
      });
      const data = await res.json();
      setBookingConfirmed(data);
    } catch (err) {
      console.error("Booking failed:", err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 bg-slate-900 text-slate-100 min-h-screen rounded-2xl">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Book Your Appointment</h1>
        <p className="text-slate-400">Select department, location, and pick your preferred time slot.</p>
      </div>

      {/* Step 1: Specialty Pills Selection */}
      <div className="space-y-3">
        <label className="text-sm font-semibold uppercase tracking-wider text-slate-400">1. Select Medical Department</label>
        <div className="flex flex-wrap gap-3">
          {SPECIALTIES.map((spec) => (
            <button
              key={spec}
              onClick={() => setSelectedSpecialty(spec)}
              className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                selectedSpecialty === spec
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-105"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {spec}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: City Input & Search */}
      <form onSubmit={handleSearch} className="flex gap-4 items-center max-w-xl">
        <div className="relative flex-1">
          <MapPin className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder="Enter your current city (e.g. Rourkela)"
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all"
        >
          <Search className="w-4 h-4" /> Find Doctors
        </button>
      </form>

      {/* Step 3: Doctors Cards Display (Sorted by Rating DESC) */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-200 flex items-center justify-between">
          <span>Available Specialists</span>
          <span className="text-xs font-normal text-slate-400">Sorted by Highest Star Rating</span>
        </h2>

        {loading ? (
          <div className="p-12 text-center text-slate-500">Searching backend DB...</div>
        ) : doctors.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-800 rounded-xl text-center text-slate-500">
            Enter city and hit search to load specialists.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {doctors.map((doc) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                  selectedDoctor?.id === doc.id
                    ? "bg-slate-800 border-indigo-500 ring-2 ring-indigo-500/50"
                    : "bg-slate-800/50 border-slate-700/60 hover:border-slate-600"
                }`}
                onClick={() => setSelectedDoctor(doc)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg text-white">{doc.name}</h3>
                    <p className="text-sm text-indigo-400 font-medium">{doc.specialty}</p>
                  </div>
                  <div className="flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span className="text-sm font-bold text-amber-300">{doc.average_rating}</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                  <MapPin className="w-3.5 h-3.5" /> {doc.city}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Step 4: Slot Picker Section */}
      <AnimatePresence>
        {selectedDoctor && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-6 bg-slate-800/80 border border-slate-700 rounded-2xl space-y-4"
          >
            <h3 className="font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" /> Choose Time Slot for {selectedDoctor.name}
            </h3>
            <div className="flex flex-wrap gap-3">
              {TIME_SLOTS.map((slot) => (
                <button
                  key={slot}
                  onClick={() => setSelectedSlot(slot)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    selectedSlot === slot
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  {slot}
                </button>
              ))}
            </div>

            <button
              disabled={!selectedSlot}
              onClick={handleBookSlot}
              className="mt-4 px-8 py-3 bg-gradient-to-r from-indigo-500 to-emerald-500 hover:from-indigo-600 hover:to-emerald-600 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50"
            >
              Confirm Appointment
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal & Token Receipt Display */}
      <AnimatePresence>
        {bookingConfirmed && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-800 border border-slate-700 max-w-md w-full rounded-2xl p-6 space-y-6 text-center shadow-2xl"
            >
              <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto animate-bounce" />
              <div>
                <h3 className="text-2xl font-black text-white">Booking Confirmed!</h3>
                <p className="text-slate-400 text-sm mt-1">Your token number has been generated.</p>
              </div>

              <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-4 space-y-2">
                <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Your Sequential Token</p>
                <p className="text-5xl font-black text-indigo-400">#{bookingConfirmed.token_number}</p>
                <div className="text-xs text-slate-400 pt-2 border-t border-slate-800 flex justify-between">
                  <span>Slot: {bookingConfirmed.time_slot}</span>
                  <span>Date: {bookingConfirmed.booking_date}</span>
                </div>
              </div>

              <button
                onClick={() => { setBookingConfirmed(null); setSelectedDoctor(null); setSelectedSlot(""); }}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl"
              >
                Close & Return
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}