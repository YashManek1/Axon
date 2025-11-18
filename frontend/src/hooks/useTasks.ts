import { useEffect, useState } from 'react';
import { getJobs, createJob, updateJob, deleteJob, toggleJobStatus } from '../services/taskService';
import { Job, CreateJobData } from '../types';
import { getErrorMessage } from '../utils/helpers';

interface UseJobsReturn {
  jobs: Job[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addJob: (jobData: CreateJobData) => Promise<void>;
  editJob: (jobId: string, jobData: Partial<CreateJobData>) => Promise<void>;
  removeJob: (jobId: string) => Promise<void>;
  toggleStatus: (jobId: string) => Promise<void>;
}

export const useJobs = (): UseJobsReturn => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedJobs = await getJobs();
      setJobs(fetchedJobs);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const addJob = async (jobData: CreateJobData) => {
    try {
      await createJob(jobData);
      await fetchJobs();
    } catch (err) {
      throw new Error(getErrorMessage(err));
    }
  };

  const editJob = async (jobId: string, jobData: Partial<CreateJobData>) => {
    try {
      await updateJob(jobId, jobData);
      await fetchJobs();
    } catch (err) {
      throw new Error(getErrorMessage(err));
    }
  };

  const removeJob = async (jobId: string) => {
    try {
      await deleteJob(jobId);
      await fetchJobs();
    } catch (err) {
      throw new Error(getErrorMessage(err));
    }
  };

  const toggleStatus = async (jobId: string) => {
    try {
      await toggleJobStatus(jobId);
      await fetchJobs();
    } catch (err) {
      throw new Error(getErrorMessage(err));
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  return {
    jobs,
    loading,
    error,
    refetch: fetchJobs,
    addJob,
    editJob,
    removeJob,
    toggleStatus,
  };
};