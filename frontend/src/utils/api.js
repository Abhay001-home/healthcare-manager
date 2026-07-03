import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 30000,
});

// Inject JWT from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global response interceptor — surface clean error messages
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Token expired or invalid — clear session and reload to login
      localStorage.removeItem('hm_token');
      localStorage.removeItem('hm_user');
      window.location.href = '/login';
    }
    const message =
      err.response?.data?.error ||
      err.response?.data?.errors?.[0]?.msg ||
      err.message ||
      'Unexpected error';
    return Promise.reject(new Error(message));
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login    = (d) => api.post('/api/auth/login', d).then((r) => r.data);
export const register = (d) => api.post('/api/auth/register', d).then((r) => r.data);
export const me       = ()  => api.get('/api/auth/me').then((r) => r.data);

// ── Doctors ───────────────────────────────────────────────────────────────────
export const getDoctors           = (spec) => api.get('/api/doctors', { params: { specialisation: spec } }).then((r) => r.data);
export const getSpecialisations   = ()     => api.get('/api/doctors/specialisations').then((r) => r.data);
export const getDoctor            = (id)   => api.get(`/api/doctors/${id}`).then((r) => r.data);
export const getAvailability      = (id, date) => api.get(`/api/doctors/${id}/availability`, { params: { date } }).then((r) => r.data);
export const getDoctorLeaves      = (id)   => api.get(`/api/doctors/${id}/leaves`).then((r) => r.data);

// ── Appointments ──────────────────────────────────────────────────────────────
export const holdSlot             = (d)    => api.post('/api/appointments/hold', d).then((r) => r.data);
export const confirmAppointment   = (d)    => api.post('/api/appointments/confirm', d).then((r) => r.data);
export const getAppointments      = ()     => api.get('/api/appointments').then((r) => r.data);
export const getAppointment       = (id)   => api.get(`/api/appointments/${id}`).then((r) => r.data);
export const cancelAppointment    = (id)   => api.delete(`/api/appointments/${id}`).then((r) => r.data);
export const generatePreVisit     = (id)   => api.post(`/api/appointments/${id}/pre-visit-summary`).then((r) => r.data);
export const submitPostVisit      = (id, d) => api.post(`/api/appointments/${id}/post-visit`, d).then((r) => r.data);

// ── Admin ─────────────────────────────────────────────────────────────────────
export const getAdminStats        = ()     => api.get('/api/admin/stats').then((r) => r.data);
export const getAdminDoctors      = ()     => api.get('/api/admin/doctors').then((r) => r.data);
export const createAdminDoctor    = (d)    => api.post('/api/admin/doctors', d).then((r) => r.data);
export const updateAdminDoctor    = (id, d) => api.put(`/api/admin/doctors/${id}`, d).then((r) => r.data);
export const setDoctorLeave       = (id, d) => api.post(`/api/admin/doctors/${id}/leave`, d).then((r) => r.data);
export const removeDoctorLeave    = (id, date) => api.delete(`/api/admin/doctors/${id}/leave/${date}`).then((r) => r.data);
export const getEmailLog          = (s)    => api.get('/api/admin/email-log', { params: { status: s } }).then((r) => r.data);
export const getReminders         = ()     => api.get('/api/admin/reminders').then((r) => r.data);
export const getAdminPatients     = ()     => api.get('/api/admin/patients').then((r) => r.data);

// ── Calendar ──────────────────────────────────────────────────────────────────
export const getCalendarAuthUrl   = ()     => api.get('/api/calendar/auth-url').then((r) => r.data);
export const getCalendarStatus    = ()     => api.get('/api/calendar/status').then((r) => r.data);

export default api;
