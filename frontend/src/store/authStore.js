import { create } from 'zustand';
import api from '../lib/api';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,

  hydrate: () => {
    const token = localStorage.getItem('accessToken');
    const user  = localStorage.getItem('user');
    if (token && user) {
      set({ user: JSON.parse(user), isAuthenticated: true });
    }
  },

  refreshMe: async () => {
    try {
      const { data } = await api.get('/auth/me');
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      const updated = { ...stored, ...data };
      localStorage.setItem('user', JSON.stringify(updated));
      set(s => ({ user: { ...s.user, ...data } }));
    } catch (_) {}
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    set({ user: data.user, isAuthenticated: true });
    try {
      const me = await api.get('/auth/me').then(r => r.data);
      const merged = { ...data.user, ...me };
      localStorage.setItem('user', JSON.stringify(merged));
      set({ user: merged });
    } catch (_) {}
    return data.user;
  },

  logout: () => {
    localStorage.clear();
    set({ user: null, isAuthenticated: false });
  },
}));
