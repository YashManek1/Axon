export const API_BASE_URL = import.meta.env.VITE_API_URL;

export const API_ENDPOINTS = {
  // User endpoints
  REGISTER: '/users/register',
  LOGIN: '/users/login',
  
  // Job endpoints
  CREATE_JOB: '/jobs/createJob',
  GET_JOBS: '/jobs/getJobs',
  GET_JOB_BY_ID: (id: string) => `/jobs/getJobById/${id}`,
  UPDATE_JOB: (id: string) => `/jobs/updateJob/${id}`,
  DELETE_JOB: (id: string) => `/jobs/deleteJob/${id}`,
  TOGGLE_JOB_STATUS: (id: string) => `/jobs/toggleJobStatus/${id}`,
  
  // Admin endpoints
  HEALTH: '/admin/health',
  JOB_STATS: '/admin/job-stats',
  USER_STATS: '/admin/user-stats',
  ALL_JOBS: '/admin/all-jobs',
  ALL_USERS: '/admin/all-users',
};

export const LOCAL_STORAGE_KEYS = {
  TOKEN: 'devifyx_token',
  USER: 'devifyx_user',
};

export const JOB_TYPES = {
  HTTP: 'http',
  SHELL: 'shell',
} as const;

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

export const CRON_EXAMPLES = {
  EVERY_MINUTE: '* * * * *',
  EVERY_HOUR: '0 * * * *',
  EVERY_DAY_MIDNIGHT: '0 0 * * *',
  EVERY_WEEK: '0 0 * * 0',
  EVERY_MONTH: '0 0 1 * *',
};

export const CRON_HELP_TEXT = `
Cron format: minute hour day month weekday
Examples:
- "* * * * *" = Every minute
- "0 * * * *" = Every hour
- "0 0 * * *" = Every day at midnight
- "0 9 * * 1-5" = Every weekday at 9 AM
- "*/15 * * * *" = Every 15 minutes
`;