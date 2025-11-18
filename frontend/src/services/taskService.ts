import apiClient from "./api";
import { API_ENDPOINTS } from "../utils/constants";
import {
  Job,
  CreateJobData,
  UpdateJobData,
  AuthResponse,
  LoginCredentials,
  RegisterData,
  JobStats,
  UserStats,
  User,
} from "../types";

// Auth Services
export const login = async (
  credentials: LoginCredentials
): Promise<AuthResponse> => {
  const response = await apiClient.post(API_ENDPOINTS.LOGIN, credentials);
  return response.data;
};

export const register = async (data: RegisterData): Promise<AuthResponse> => {
  const response = await apiClient.post(API_ENDPOINTS.REGISTER, data);
  return response.data;
};

// Job Services
export const createJob = async (jobData: CreateJobData): Promise<Job> => {
  const response = await apiClient.post(API_ENDPOINTS.CREATE_JOB, jobData);
  return response.data.job || response.data;
};

export const getJobs = async (): Promise<Job[]> => {
  const response = await apiClient.get(API_ENDPOINTS.GET_JOBS);
  return response.data;
};

export const getJobById = async (jobId: string): Promise<Job> => {
  const response = await apiClient.get(API_ENDPOINTS.GET_JOB_BY_ID(jobId));
  return response.data;
};

export const updateJob = async (
  jobId: string,
  jobData: Partial<CreateJobData>
): Promise<Job> => {
  const response = await apiClient.put(
    API_ENDPOINTS.UPDATE_JOB(jobId),
    jobData
  );
  return response.data.job || response.data;
};

export const deleteJob = async (jobId: string): Promise<void> => {
  await apiClient.delete(API_ENDPOINTS.DELETE_JOB(jobId));
};

export const toggleJobStatus = async (jobId: string): Promise<Job> => {
  const response = await apiClient.patch(
    API_ENDPOINTS.TOGGLE_JOB_STATUS(jobId)
  );
  return response.data.job || response.data;
};

// Admin Services
export const getHealth = async (): Promise<any> => {
  const response = await apiClient.get(API_ENDPOINTS.HEALTH);
  return response.data;
};

export const getJobStats = async (): Promise<JobStats> => {
  const response = await apiClient.get(API_ENDPOINTS.JOB_STATS);
  return response.data;
};

export const getUserStats = async (): Promise<UserStats> => {
  const response = await apiClient.get(API_ENDPOINTS.USER_STATS);
  return response.data;
};

export const getAllJobs = async (): Promise<Job[]> => {
  const response = await apiClient.get(API_ENDPOINTS.ALL_JOBS);
  return response.data;
};

export const getAllUsers = async (): Promise<User[]> => {
  const response = await apiClient.get(API_ENDPOINTS.ALL_USERS);
  return response.data;
};
