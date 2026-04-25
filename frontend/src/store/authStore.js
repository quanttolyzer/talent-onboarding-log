import { create } from 'zustand';
import api from '../lib/api';

export const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,

  // 👇 NEW: load user from localStorage on app start
  hydrate: () => {
    const token = localStorage.getItem('accessToken');
    const user = localStorage.getItem('user');

    if (token && user) {
      set({
        user: JSON.parse(user),
        isAuthenticated: true,
      });
    }
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });

    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));

    set({
      user: data.user,
      isAuthenticated: true,
    });

    return data.user;
  },

  logout: () => {
    localStorage.clear();
    set({
      user: null,
      isAuthenticated: false,
    });
  },
}));