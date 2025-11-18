import React, { useState, useEffect } from "react";
import { Job, CreateJobData } from "../../types";
import {
  JOB_TYPES,
  HTTP_METHODS,
  CRON_EXAMPLES,
  CRON_HELP_TEXT,
} from "../../utils/constants";
import { isValidCron, isValidUrl } from "../../utils/helpers";
import "./TaskForm.css";

interface TaskFormProps {
  job?: Job;
  onSubmit: (jobData: CreateJobData) => Promise<void>;
  onCancel: () => void;
}

const TaskForm: React.FC<TaskFormProps> = ({ job, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<CreateJobData>({
    name: "",
    description: "",
    type: "http",
    schedule: CRON_EXAMPLES.EVERY_HOUR,
    enabled: true,
    url: "",
    method: "GET",
    headers: {},
    body: "",
    command: "",
    workingDirectory: "",
    dependsOn: [],
  });

  const [headersText, setHeadersText] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (job) {
      // Extract fields from payload if they exist
      const jobPayload = (job as any).payload || {};

      setFormData({
        name: job.name,
        description: job.description || "",
        type: job.type,
        schedule: job.schedule,
        enabled: job.enabled,
        url: jobPayload.url || job.url || "",
        method: jobPayload.method || job.method || "GET",
        headers: jobPayload.headers || job.headers || {},
        body: jobPayload.body
          ? JSON.stringify(jobPayload.body, null, 2)
          : job.body
          ? JSON.stringify(job.body, null, 2)
          : "",
        command: jobPayload.command || job.command || "",
        workingDirectory: job.workingDirectory || "",
        dependsOn: job.dependsOn?.map((j) => j._id) || [],
      });

      const headers = jobPayload.headers || job.headers;
      if (headers) {
        setHeadersText(JSON.stringify(headers, null, 2));
      }
    }
  }, [job]);

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validation
    if (!formData.name.trim()) {
      setError("Job name is required");
      return;
    }

    if (!isValidCron(formData.schedule)) {
      setError(
        "Invalid cron expression. Format: minute hour day month weekday"
      );
      return;
    }

    if (formData.type === "http") {
      if (!formData.url || !isValidUrl(formData.url)) {
        setError("Valid URL is required for HTTP jobs");
        return;
      }
    }

    if (formData.type === "shell") {
      if (!formData.command?.trim()) {
        setError("Command is required for Shell jobs");
        return;
      }
    }

    try {
      setLoading(true);

      // Parse headers if provided
      let parsedHeaders = {};
      if (headersText.trim()) {
        try {
          parsedHeaders = JSON.parse(headersText);
        } catch {
          setError("Invalid JSON in headers");
          return;
        }
      }

      // Parse body if provided
      let parsedBody = formData.body;
      if (formData.body && formData.body.trim()) {
        try {
          parsedBody = JSON.parse(formData.body);
        } catch {
          // Keep as string if not valid JSON
        }
      }

      // Transform data to match backend API structure
      const payload =
        formData.type === "http"
          ? {
              url: formData.url,
              method: formData.method,
              headers: parsedHeaders,
              body: parsedBody,
            }
          : {
              command: formData.command,
            };

      const submitData: any = {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        schedule: formData.schedule,
        enabled: formData.enabled,
        payload: payload,
        dependsOn: formData.dependsOn,
      };

      await onSubmit(submitData);
      setSuccess(
        job ? "Job updated successfully!" : "Job created successfully!"
      );
      setTimeout(() => {
        onCancel();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to save job");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="task-form-container">
      <form onSubmit={handleSubmit} className="task-form">
        <h3>{job ? "Edit Job" : "Create New Job"}</h3>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="form-group">
          <label htmlFor="name">Job Name *</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={3}
          />
        </div>

        <div className="form-group">
          <label htmlFor="type">Job Type *</label>
          <select
            id="type"
            name="type"
            value={formData.type}
            onChange={handleInputChange}
            required
          >
            <option value="http">HTTP Request</option>
            <option value="shell">Shell Command</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="schedule">Schedule (Cron) *</label>
          <input
            type="text"
            id="schedule"
            name="schedule"
            value={formData.schedule}
            onChange={handleInputChange}
            required
            placeholder="* * * * *"
          />
          <small className="hint">{CRON_HELP_TEXT}</small>
          <div style={{ marginTop: "0.5rem" }}>
            <small>Quick select: </small>
            {Object.entries(CRON_EXAMPLES).map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, schedule: value }))
                }
                style={{
                  marginRight: "0.5rem",
                  fontSize: "0.8rem",
                  padding: "0.25rem 0.5rem",
                }}
              >
                {key.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        {formData.type === "http" && (
          <>
            <div className="form-group">
              <label htmlFor="url">URL *</label>
              <input
                type="url"
                id="url"
                name="url"
                value={formData.url}
                onChange={handleInputChange}
                required
                placeholder="https://api.example.com/endpoint"
              />
            </div>

            <div className="form-group">
              <label htmlFor="method">HTTP Method</label>
              <select
                id="method"
                name="method"
                value={formData.method}
                onChange={handleInputChange}
              >
                {HTTP_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="headers">Headers (JSON)</label>
              <textarea
                id="headers"
                value={headersText}
                onChange={(e) => setHeadersText(e.target.value)}
                rows={4}
                placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
              />
            </div>

            <div className="form-group">
              <label htmlFor="body">Request Body (JSON)</label>
              <textarea
                id="body"
                name="body"
                value={formData.body}
                onChange={handleInputChange}
                rows={4}
                placeholder='{"key": "value"}'
              />
            </div>
          </>
        )}

        {formData.type === "shell" && (
          <>
            <div className="form-group">
              <label htmlFor="command">Command *</label>
              <textarea
                id="command"
                name="command"
                value={formData.command}
                onChange={handleInputChange}
                required
                rows={3}
                placeholder="npm run build"
              />
            </div>

            <div className="form-group">
              <label htmlFor="workingDirectory">Working Directory</label>
              <input
                type="text"
                id="workingDirectory"
                name="workingDirectory"
                value={formData.workingDirectory}
                onChange={handleInputChange}
                placeholder="/path/to/directory"
              />
            </div>
          </>
        )}

        <div className="form-group">
          <label>
            <input
              type="checkbox"
              name="enabled"
              checked={formData.enabled}
              onChange={handleInputChange}
            />{" "}
            Enabled
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? "Saving..." : job ? "Update Job" : "Create Job"}
          </button>
          <button
            type="button"
            className="btn-cancel"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default TaskForm;
