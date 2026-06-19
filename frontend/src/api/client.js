import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:8000',
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  loginUser: (username, password) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    return API.post('/token', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  },
  loginDoctor: (email, password) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    return API.post('/doctor/token', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  },
  registerUser: (userData) => API.post('/register', userData),
  
  // ✅ FIXED: Now using the correctly instantiated API client instance
  registerDoctor: (data) => API.post('/doctor/register', data),
  
  getMe: () => API.get('/users/me/'),
  getDoctorMe: () => API.get('/doctor/me'),
};

export const medicalAPI = {
  uploadPDF: (file, language = 'English') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('language', language);
    return API.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  chat: ({ message, history = [], language = 'English', context = '' }) => (
    API.post('/chat', { message, history, language, context })
  ),
  forwardCase: ({ doctorEmail, aiAnalysis, language = 'English', uploadedFilename }) => (
    API.post('/api/medical/cases/forward', {
      doctor_email: doctorEmail,
      ai_response_text: aiAnalysis,
      patient_language: language,
      uploaded_filename: uploadedFilename,
    })
  ),
  getDoctorQueue: (email) => API.get('/api/medical/doctor/cases', { params: { email } }),
  updatePrescription: (caseId, prescriptionData) => (
    API.put(`/api/medical/cases/${caseId}/prescription`, prescriptionData)
  ),
  approveCase: (caseId, prescriptionData) => (
    API.post(`/api/medical/cases/${caseId}/approve`, prescriptionData)
  ),
  getPatientCases: () => API.get('/api/medical/patient/cases'),
  downloadPrescription: (caseId) => (
    API.get(`/api/medical/cases/${caseId}/download`, { responseType: 'blob' })
  ),
};

export const doctorAPI = {
  getQueue: (email) => medicalAPI.getDoctorQueue(email),
  approvePrescription: (caseId, prescriptionData) => medicalAPI.approveCase(caseId, prescriptionData),
};

export const downloadPDF = async (caseId) => {
  const response = await medicalAPI.downloadPrescription(caseId);
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `medi_friend_prescription_${caseId}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};