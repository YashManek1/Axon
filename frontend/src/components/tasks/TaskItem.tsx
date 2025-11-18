import React from 'react';
import { Job } from '../../types';
import { formatDate, parseCronExpression } from '../../utils/helpers';
import './TaskItem.css';

interface TaskItemProps {
  job: Job;
  onEdit: (job: Job) => void;
  onDelete: (jobId: string) => void;
  onToggle: (jobId: string) => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ job, onEdit, onDelete, onToggle }) => {
  return (
    <div className="task-item">
      <div className="task-header">
        <div>
          <h3 className="task-name">{job.name}</h3>
          <span className="task-type">{job.type.toUpperCase()}</span>
        </div>
        <span className={`task-status ${job.enabled ? 'enabled' : 'disabled'}`}>
          {job.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {job.description && <p>{job.description}</p>}

      <div className="task-schedule">
        <strong>📅 Schedule:</strong> {job.schedule}
        <br />
        <small>{parseCronExpression(job.schedule)}</small>
      </div>

      <div className="task-details">
        {job.type === 'http' && (
          <>
            <p><strong>Method:</strong> {job.method}</p>
            <p><strong>URL:</strong> {job.url}</p>
            {job.headers && Object.keys(job.headers).length > 0 && (
              <p><strong>Headers:</strong> {Object.keys(job.headers).length} header(s)</p>
            )}
          </>
        )}

        {job.type === 'shell' && (
          <>
            <p><strong>Command:</strong> <code>{job.command}</code></p>
            {job.workingDirectory && (
              <p><strong>Working Directory:</strong> {job.workingDirectory}</p>
            )}
          </>
        )}

        {job.dependsOn && job.dependsOn.length > 0 && (
          <p><strong>Dependencies:</strong> {job.dependsOn.map(d => d.name).join(', ')}</p>
        )}

        <p><strong>Created:</strong> {formatDate(job.createdAt)}</p>
      </div>

      <div className="task-actions">
        <button onClick={() => onEdit(job)} className="btn btn-edit">
          Edit
        </button>
        <button onClick={() => onToggle(job._id)} className="btn btn-toggle">
          {job.enabled ? 'Disable' : 'Enable'}
        </button>
        <button onClick={() => onDelete(job._id)} className="btn btn-delete">
          Delete
        </button>
      </div>
    </div>
  );
};

export default TaskItem;