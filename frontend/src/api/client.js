import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:8000',
});

// Interceptor to inject the JWT token into requests
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});

// --- General / Patient Auth API ---
export const authAPI = {
  // Uses OAuth2PasswordRequestForm (requires URLSearchParams)
  loginUser: (username, password) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    return API.post('/token', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  },
  registerUser: (userData) => API.post('/register', userData),
  getMe: (tokenOverride) => {
    const headers = tokenOverride ? { Authorization: `Bearer ${tokenOverride}` } : {};
    return API.get('/users/me', { headers });
  },
};

// --- Report Processing & AI Chat API ---
export const medicalAPI = {
  uploadPDF: (file, language = 'English') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('language', language);
    return API.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  chat: ({ message, history = [], language = 'English', sessionId = null }) =>
    API.post('/chat', { message, history, language, session_id: sessionId }),
};

// --- Doctor Authentication API ---
export const doctorAuthAPI = {
  // Uses standard JSON payload based on schemas.DoctorRegister
  registerDoctor: (doctorData) => API.post('/api/doctor/register', doctorData),
  // Uses standard JSON payload based on schemas.DoctorLogin
  loginDoctor: (credentials) => API.post('/api/doctor/login', credentials),
};

// --- Patient Search & Slot Booking API ---
export const bookingAPI = {
  // Search doctors by specialty and city using query parameters
  searchDoctors: (specialty, city) =>
    API.get('/api/doctors/search', { params: { specialty, city } }),
  
  // Create a new appointment booking
  bookAppointment: (bookingData) => API.post('/api/bookings/create', bookingData),
};

// --- Doctor Dashboard API ---
export const doctorDashboardAPI = {
  // Fetch analytics for a specific doctor
  getAnalytics: (doctorId) => API.get(`/api/doctor/${doctorId}/analytics`),
  
  // Fetch today's patient queue for a specific doctor
  getQueue: (doctorId) => API.get(`/api/doctor/${doctorId}/queue`),
};

// --- System / Cron API ---
export const systemAPI = {
  // Trigger archiving of expired/rated bookings
  archiveBookings: () => API.post('/api/cron/archive-bookings'),
};

export default API;