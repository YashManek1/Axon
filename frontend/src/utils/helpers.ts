import { LOCAL_STORAGE_KEYS } from './constants';

// Authentication helpers
export const getToken = (): string | null => {
  return localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN);
};

export const setToken = (token: string): void => {
  localStorage.setItem(LOCAL_STORAGE_KEYS.TOKEN, token);
};

export const removeToken = (): void => {
  localStorage.removeItem(LOCAL_STORAGE_KEYS.TOKEN);
};

export const getUser = () => {
  const user = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
  return user ? JSON.parse(user) : null;
};

export const setUser = (user: any): void => {
  localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify(user));
};

export const removeUser = (): void => {
  localStorage.removeItem(LOCAL_STORAGE_KEYS.USER);
};

export const isAuthenticated = (): boolean => {
  return !!getToken();
};

export const logout = (): void => {
  removeToken();
  removeUser();
  window.location.href = '/';
};

// Date formatting helpers
export const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatRelativeTime = (date: string | Date): string => {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  
  return formatDate(date);
};

// Validation helpers
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidCron = (cron: string): boolean => {
  // Basic cron validation (5 fields)
  const cronParts = cron.trim().split(/\s+/);
  return cronParts.length === 5;
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Error handling helpers
export const getErrorMessage = (error: any): string => {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.message) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

// Object helpers
export const isEmpty = (obj: any): boolean => {
  return obj === null || obj === undefined || 
         (typeof obj === 'object' && Object.keys(obj).length === 0) ||
         (typeof obj === 'string' && obj.trim().length === 0);
};

// Cron helper
export const parseCronExpression = (cron: string): string => {
  const parts = cron.split(' ');
  if (parts.length !== 5) return 'Invalid cron expression';

  const [minute, hour, day, month, weekday] = parts;
  
  let description = 'Runs ';
  
  if (minute === '*' && hour === '*' && day === '*' && month === '*' && weekday === '*') {
    return 'Runs every minute';
  }
  
  if (minute.startsWith('*/')) {
    description += `every ${minute.slice(2)} minutes`;
  } else if (minute !== '*') {
    description += `at minute ${minute}`;
  }
  
  if (hour !== '*') {
    description += ` at hour ${hour}`;
  }
  
  if (day !== '*') {
    description += ` on day ${day}`;
  }
  
  if (month !== '*') {
    description += ` in month ${month}`;
  }
  
  if (weekday !== '*') {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    description += ` on ${days[parseInt(weekday)] || `weekday ${weekday}`}`;
  }
  
  return description;
};