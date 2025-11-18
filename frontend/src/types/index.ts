// User types
export interface User {
  _id: string;
  email: string;
  organizationName: string;
  role: "user" | "admin";
  createdAt: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  orgName: string;
}

// Job types
export interface Job {
  _id: string;
  name: string;
  description?: string;
  type: "http" | "shell";
  schedule: string;
  enabled: boolean;
  userId: string;
  orgId: string;
  dependsOn?: Job[];
  payload?: {
    // HTTP payload
    url?: string;
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    headers?: Record<string, string>;
    body?: any;
    // Shell payload
    command?: string;
  };

  // Legacy fields for backward compatibility
  url?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: any;
  command?: string;
  workingDirectory?: string;

  createdAt: string;
  updatedAt: string;
}

export interface CreateJobData {
  name: string;
  description?: string;
  type: "http" | "shell";
  schedule: string;
  enabled?: boolean;
  dependsOn?: string[];

  // HTTP job fields
  url?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: any;

  // Shell job fields
  command?: string;
  workingDirectory?: string;
}

export interface UpdateJobData extends Partial<CreateJobData> {
  _id: string;
}

// Admin stats types
export interface JobStats {
  totalJobs: number;
  enabledJobs: number;
  disabledJobs: number;
  httpJobs: number;
  shellJobs: number;
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface JobHistoryItem {
  _id: string;
  jobId: string;
  status: "success" | "failure";
  startTime: Date;
  endTime: Date;
  output?: string;
  error?: string;
}
