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
  registerUser: (userData) => API.post('/register', userData),
  getMe: () => API.get('/users/me/'),
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
  chat: ({ message, history = [], language = 'English', sessionId = null }) => (
    API.post('/chat', { message, history, language, session_id: sessionId })
  ),
};

