import React, { useState } from 'react';
import { Job } from '../../types';
import TaskItem from './TaskItem';
import Loader from '../common/Loader';
import './TaskList.css';

interface TaskListProps {
  jobs: Job[];
  loading: boolean;
  error: string | null;
  onEdit: (job: Job) => void;
  onDelete: (jobId: string) => void;
  onToggle: (jobId: string) => void;
}

const TaskList: React.FC<TaskListProps> = ({ jobs, loading, error, onEdit, onDelete, onToggle }) => {
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'http' | 'shell'>('all');

  if (loading) {
    return <Loader text="Loading jobs..." />;
  }

  if (error) {
    return (
      <div className="task-list">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  const filteredJobs = jobs.filter(job => {
    if (filter === 'enabled') return job.enabled;
    if (filter === 'disabled') return !job.enabled;
    if (filter === 'http') return job.type === 'http';
    if (filter === 'shell') return job.type === 'shell';
    return true;
  });

  return (
    <div className="task-list">
      <div className="task-list-header">
        <h2>Your Jobs ({filteredJobs.length})</h2>
        <div className="task-filters">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({jobs.length})
          </button>
          <button
            className={`filter-btn ${filter === 'enabled' ? 'active' : ''}`}
            onClick={() => setFilter('enabled')}
          >
            Enabled ({jobs.filter(j => j.enabled).length})
          </button>
          <button
            className={`filter-btn ${filter === 'disabled' ? 'active' : ''}`}
            onClick={() => setFilter('disabled')}
          >
            Disabled ({jobs.filter(j => !j.enabled).length})
          </button>
          <button
            className={`filter-btn ${filter === 'http' ? 'active' : ''}`}
            onClick={() => setFilter('http')}
          >
            HTTP ({jobs.filter(j => j.type === 'http').length})
          </button>
          <button
            className={`filter-btn ${filter === 'shell' ? 'active' : ''}`}
            onClick={() => setFilter('shell')}
          >
            Shell ({jobs.filter(j => j.type === 'shell').length})
          </button>
        </div>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="no-tasks">
          {filter === 'all' 
            ? 'No jobs yet. Create your first scheduled job!' 
            : `No ${filter} jobs found.`}
        </div>
      ) : (
        <div className="tasks-grid">
          {filteredJobs.map(job => (
            <TaskItem
              key={job._id}
              job={job}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskList;