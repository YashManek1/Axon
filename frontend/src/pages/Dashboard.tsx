import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../hooks/useTasks';
import { Job, CreateJobData } from '../types';
import { isAuthenticated } from '../utils/helpers';
import TaskList from '../components/tasks/TaskList';
import TaskForm from '../components/tasks/TaskForm';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { jobs, loading, error, refetch, addJob, editJob, removeJob, toggleStatus } = useJobs();
  const [showModal, setShowModal] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
    }
  }, [navigate]);

  const handleCreateJob = () => {
    setEditingJob(null);
    setShowModal(true);
    setActionError(null);
  };

  const handleEditJob = (job: Job) => {
    setEditingJob(job);
    setShowModal(true);
    setActionError(null);
  };

  const handleSubmitJob = async (jobData: CreateJobData) => {
    try {
      setActionError(null);
      if (editingJob) {
        await editJob(editingJob._id, jobData);
      } else {
        await addJob(jobData);
      }
      setShowModal(false);
      setEditingJob(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to save job');
      throw err;
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (window.confirm('Are you sure you want to delete this job?')) {
      try {
        setActionError(null);
        await removeJob(jobId);
      } catch (err: any) {
        setActionError(err.message || 'Failed to delete job');
      }
    }
  };

  const handleToggleJob = async (jobId: string) => {
    try {
      setActionError(null);
      await toggleStatus(jobId);
    } catch (err: any) {
      setActionError(err.message || 'Failed to toggle job status');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingJob(null);
    setActionError(null);
  };

  // Calculate stats
  const stats = {
    total: jobs.length,
    enabled: jobs.filter(j => j.enabled).length,
    disabled: jobs.filter(j => !j.enabled).length,
    http: jobs.filter(j => j.type === 'http').length,
    shell: jobs.filter(j => j.type === 'shell').length,
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Job Dashboard</h1>
        <button onClick={handleCreateJob} className="btn-create">
          + Create New Job
        </button>
      </div>

      {actionError && (
        <div className="error-message" style={{ marginBottom: '1rem' }}>
          {actionError}
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Jobs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.enabled}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.http}</div>
          <div className="stat-label">HTTP Jobs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.shell}</div>
          <div className="stat-label">Shell Jobs</div>
        </div>
      </div>

      {jobs.length === 0 && !loading ? (
        <div className="empty-state">
          <h2>No jobs yet</h2>
          <p>Create your first scheduled job to get started!</p>
          <button onClick={handleCreateJob} className="btn-create">
            Create Your First Job
          </button>
        </div>
      ) : (
        <TaskList
          jobs={jobs}
          loading={loading}
          error={error}
          onEdit={handleEditJob}
          onDelete={handleDeleteJob}
          onToggle={handleToggleJob}
        />
      )}

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <TaskForm
              job={editingJob || undefined}
              onSubmit={handleSubmitJob}
              onCancel={handleCloseModal}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;