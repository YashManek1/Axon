import { useState } from "react";
import { X, Check } from "lucide-react";
import { toast } from "../../stores/toastStore";
import { jobsAPI } from "../../services/api";
import { Job } from "../../types/job";

interface CreateJobModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const steps = [
  "Basic Info",
  "Job Type",
  "Configuration",
  "Data Vault",
  "Schedule",
  "Review",
];

const defaultSink = {
  type: null,
  uri: "",
  databaseName: "",
  collectionName: "",
  exportFormat: [],
  encryptionAlg: "AES-256-GCM",
};

export default function CreateJobModal({
  onClose,
  onSuccess,
}: CreateJobModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Massive state object holding everything from the wizard
  const [formData, setFormData] = useState<Partial<Job>>({
    name: "",
    category: "Data Processing",
    priority: "Medium",
    tags: [],
    description: "",
    type: "http",
    timeout: 30,
    payload: {
      method: "GET",
      url: "",
      headers: {},
      body: "",
    },
    retryLimit: 0,
    notifications: {
      onSuccess: true,
      onFailure: true,
      recipients: [],
    },
    sink: defaultSink,
    scheduleType: "Cron",
    schedule: "*/5 * * * *",
    timezone: "UTC",
    executionWindow: {
      enabled: false,
      startTime: "08:00",
      endTime: "18:00",
      activeDays: ["M", "T", "W", "Th", "F"],
    },
    enabled: true,
  });

  const updateForm = (updates: Partial<Job>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleCreate = async () => {
    try {
      setIsSubmitting(true);

      // Cleanup payload based on type
      let finalPayload: Record<string, unknown> = {};

      if (formData.type === "http") {
        const httpPayload = formData.payload as {
          url?: string;
          method?: string;
          headers?: Record<string, string>;
        };
        finalPayload = {
          url: httpPayload.url,
          method: httpPayload.method,
          headers: httpPayload.headers || {},
        };
      } else {
        const shellPayload = formData.payload as { command?: string };
        finalPayload = {
          command: shellPayload.command,
        };
      }

      const submissionData = {
        ...formData,
        payload: finalPayload,
      };

      await jobsAPI.create(submissionData);
      toast.success("Job Created", "Your new job has been deployed.");
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Internal error";
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast.error(
        "Deployment Failed",
        axiosErr.response?.data?.message || errorMsg,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Job Name
              </label>
              <input
                type="text"
                value={formData.name || ""}
                onChange={(e) => updateForm({ name: e.target.value })}
                placeholder="Production API Monitor"
                className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Job Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => updateForm({ category: e.target.value })}
                  className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="Data Processing">Data Processing</option>
                  <option value="Monitoring">Monitoring</option>
                  <option value="System Tools">System Tools</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Priority Level
                </label>
                <div className="flex gap-2">
                  {(["Low", "Medium", "High"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => updateForm({ priority: p })}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        formData.priority === p
                          ? "bg-[#2d2d3a] border-blue-500 text-white"
                          : "bg-[#1a1a24] border-[#2d2d3a] text-gray-400 hover:text-white"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={formData.description || ""}
                onChange={(e) => updateForm({ description: e.target.value })}
                rows={3}
                placeholder="Monitors production API endpoints for availability..."
                className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-center p-2 bg-[#1a1a24] rounded-lg border border-[#2d2d3a]">
              <span
                className={`px-4 py-2 rounded text-sm font-medium ${formData.type === "http" ? "text-white" : "text-gray-400"}`}
              >
                HTTP Webhook
              </span>
              <button
                onClick={() =>
                  updateForm({
                    type: formData.type === "http" ? "shell" : "http",
                  })
                }
                className="mx-4 relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${formData.type === "shell" ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
              <span
                className={`px-4 py-2 rounded text-sm font-medium ${formData.type === "shell" ? "text-white" : "text-gray-400"}`}
              >
                Remote Shell
              </span>
            </div>

            {formData.type === "http" ? (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      HTTP Method
                    </label>
                    <div className="flex gap-2">
                      {["GET", "POST", "PUT", "DELETE"].map((m) => (
                        <button
                          key={m}
                          onClick={() =>
                            updateForm({
                              payload: { ...formData.payload, method: m },
                            })
                          }
                          className={`flex-1 py-1.5 rounded border text-sm ${
                            (formData.payload as { method?: string })
                              ?.method === m
                              ? "bg-blue-600/20 border-blue-500 text-blue-400"
                              : "bg-[#1a1a24] border-[#2d2d3a] text-gray-400"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Timeout (s)
                    </label>
                    <input
                      type="number"
                      value={formData.timeout || 30}
                      onChange={(e) =>
                        updateForm({ timeout: parseInt(e.target.value) })
                      }
                      className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-lg px-4 py-1.5 text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Webhook URL
                  </label>
                  <input
                    type="text"
                    value={(formData.payload as { url?: string })?.url || ""}
                    onChange={(e) =>
                      updateForm({
                        payload: { ...formData.payload, url: e.target.value },
                      })
                    }
                    placeholder="https://api.internal/health"
                    className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-lg px-4 py-2 text-white font-mono"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Shell Command
                </label>
                <input
                  type="text"
                  value={
                    (formData.payload as { command?: string })?.command || ""
                  }
                  onChange={(e) =>
                    updateForm({
                      payload: { ...formData.payload, command: e.target.value },
                    })
                  }
                  placeholder="python3 scripts/etl.py"
                  className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-lg px-4 py-2 text-white font-mono"
                />
              </div>
            )}
          </div>
        );
      case 2:
        return (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-[#1a1a24] border border-[#2d2d3a] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-white">
                  Auto Retry on Failure
                </h4>
                <button
                  onClick={() =>
                    updateForm({
                      retryLimit: (formData.retryLimit ?? 0) === 0 ? 3 : 0,
                    })
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${(formData.retryLimit ?? 0) > 0 ? "bg-blue-600" : "bg-gray-700"}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${(formData.retryLimit ?? 0) > 0 ? "translate-x-4" : "translate-x-0"}`}
                  />
                </button>
              </div>
              {(formData.retryLimit ?? 0) > 0 && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Max Retries
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.retryLimit}
                    onChange={(e) =>
                      updateForm({ retryLimit: parseInt(e.target.value) })
                    }
                    className="w-full bg-[#0a0a0f] border border-[#2d2d3a] rounded-lg px-3 py-1.5 text-white"
                  />
                </div>
              )}
            </div>
            <div className="bg-[#1a1a24] border border-[#2d2d3a] rounded-xl p-5">
              <h4 className="font-semibold text-white mb-4">Notifications</h4>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.notifications?.onSuccess || false}
                    onChange={(e) =>
                      updateForm({
                        notifications: {
                          ...(formData.notifications || {
                            onFailure: false,
                            recipients: [],
                          }),
                          onSuccess: e.target.checked,
                        },
                      })
                    }
                    className="rounded bg-[#0a0a0f] border-[#2d2d3a] text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-300">On Success</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.notifications?.onFailure || false}
                    onChange={(e) =>
                      updateForm({
                        notifications: {
                          ...(formData.notifications || {
                            onSuccess: false,
                            recipients: [],
                          }),
                          onFailure: e.target.checked,
                        },
                      })
                    }
                    className="rounded bg-[#0a0a0f] border-[#2d2d3a] text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-300">On Failure</span>
                </label>
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-[#1a1a24] border border-[#2d2d3a] p-4 rounded-xl">
              <div>
                <h3 className="font-semibold text-white">Enable Data Sink</h3>
                <p className="text-xs text-gray-400">
                  Store job execution results in MongoDB
                </p>
              </div>
              <button
                onClick={() =>
                  updateForm({
                    sink: {
                      ...(formData.sink || defaultSink),
                      type: formData.sink?.type === "mongo" ? null : "mongo",
                    },
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${formData.sink?.type === "mongo" ? "bg-blue-600" : "bg-gray-700"}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.sink?.type === "mongo" ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>

            {formData.sink?.type === "mongo" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    MongoDB Connection URI
                  </label>
                  <input
                    type="text"
                    value={formData.sink.uri || ""}
                    onChange={(e) =>
                      updateForm({
                        sink: {
                          ...(formData.sink || {
                            databaseName: "",
                            collectionName: "",
                            exportFormat: [],
                            encryptionAlg: "AES-256-GCM",
                            type: null,
                          }),
                          uri: e.target.value,
                        },
                      })
                    }
                    placeholder="mongodb://admin:***@prod-db.internal:27017"
                    className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-lg px-4 py-2 text-white font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Database Name
                    </label>
                    <input
                      type="text"
                      value={formData.sink.databaseName || ""}
                      onChange={(e) =>
                        updateForm({
                          sink: {
                            ...(formData.sink || {
                              uri: "",
                              collectionName: "",
                              exportFormat: [],
                              encryptionAlg: "AES-256-GCM",
                              type: null,
                            }),
                            databaseName: e.target.value,
                          },
                        })
                      }
                      placeholder="job_results"
                      className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-lg px-4 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Collection Name
                    </label>
                    <input
                      type="text"
                      value={formData.sink.collectionName || ""}
                      onChange={(e) =>
                        updateForm({
                          sink: {
                            ...(formData.sink || {
                              uri: "",
                              databaseName: "",
                              exportFormat: [],
                              encryptionAlg: "AES-256-GCM",
                              type: null,
                            }),
                            collectionName: e.target.value,
                          },
                        })
                      }
                      placeholder="monitoring_jobs"
                      className="w-full bg-[#1a1a24] border border-[#2d2d3a] rounded-lg px-4 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#1a1a24] border border-[#2d2d3a] p-4 rounded-xl">
                    <h4 className="font-medium text-white mb-2 text-sm">
                      Export Results
                    </h4>
                    <div className="space-y-2">
                      {["CSV Format", "JSON Format", "Excel Format"].map(
                        (fmt) => (
                          <label
                            key={fmt}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              className="rounded bg-[#0a0a0f] border-[#2d2d3a] text-blue-500 focus:ring-blue-500"
                            />
                            <span className="text-xs text-gray-300">{fmt}</span>
                          </label>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="bg-[#1a1a24] border border-[#2d2d3a] p-4 rounded-xl">
                    <h4 className="font-medium text-white mb-2 text-sm flex justify-between items-center">
                      Data Encryption
                      <div className="w-8 h-4 bg-blue-600 rounded-full relative">
                        <div className="w-3 h-3 bg-white rounded-full absolute right-0.5 top-0.5"></div>
                      </div>
                    </h4>
                    <label className="block text-xs text-gray-400 mb-1">
                      Encryption Algorithm
                    </label>
                    <select className="w-full bg-[#0a0a0f] border border-[#2d2d3a] rounded-lg px-3 py-1.5 text-white text-sm">
                      <option>AES-256-GCM</option>
                      <option>AES-256-CBC</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      case 4:
        return (
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-[#1a1a24] border border-[#2d2d3a] p-5 rounded-xl">
              <h3 className="font-semibold text-white mb-4">
                Execution Schedule
              </h3>
              <div className="flex gap-2 mb-4">
                {(["Cron", "Interval", "Once"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => updateForm({ scheduleType: st })}
                    className={`flex-1 py-1.5 rounded border text-sm ${formData.scheduleType === st ? "bg-blue-600/20 border-blue-500 text-blue-400" : "bg-[#0a0a0f] border-[#2d2d3a] text-gray-400"}`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-1">
                  Cron Expression
                </label>
                <input
                  type="text"
                  value={formData.schedule || ""}
                  onChange={(e) => updateForm({ schedule: e.target.value })}
                  placeholder="*/5 * * * *"
                  className="w-full bg-[#0a0a0f] border border-[#2d2d3a] rounded-lg px-3 py-2 text-white font-mono"
                />
                <span className="text-xs text-gray-500 mt-1 block">
                  Runs every 5 minutes
                </span>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Timezone
                </label>
                <select
                  value={formData.timezone}
                  onChange={(e) => updateForm({ timezone: e.target.value })}
                  className="w-full bg-[#0a0a0f] border border-[#2d2d3a] rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                </select>
              </div>
            </div>
            <div className="bg-[#1a1a24] border border-[#2d2d3a] p-5 rounded-xl">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-white">Execution Window</h3>
                <button
                  onClick={() =>
                    updateForm({
                      executionWindow: {
                        ...(formData.executionWindow || {
                          startTime: "00:00",
                          endTime: "23:59",
                          activeDays: [],
                        }),
                        enabled: !formData.executionWindow?.enabled,
                      },
                    })
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${formData.executionWindow?.enabled ? "bg-blue-600" : "bg-gray-700"}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.executionWindow?.enabled ? "translate-x-4" : "translate-x-0"}`}
                  />
                </button>
              </div>
              <div
                className={`transition-opacity ${formData.executionWindow?.enabled ? "opacity-100" : "opacity-50 pointer-events-none"}`}
              >
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={formData.executionWindow?.startTime || ""}
                      onChange={(e) =>
                        updateForm({
                          executionWindow: {
                            ...(formData.executionWindow || {
                              enabled: false,
                              endTime: "23:59",
                              activeDays: [],
                            }),
                            startTime: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-[#0a0a0f] border border-[#2d2d3a] rounded-lg px-3 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={formData.executionWindow?.endTime}
                      onChange={(e) =>
                        updateForm({
                          executionWindow: {
                            ...(formData.executionWindow || {
                              enabled: false,
                              startTime: "00:00",
                              activeDays: [],
                            }),
                            endTime: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-[#0a0a0f] border border-[#2d2d3a] rounded-lg px-3 py-1.5 text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-2">
                    Active Days
                  </label>
                  <div className="flex gap-1 justify-between">
                    {["M", "T", "W", "Th", "F", "S", "Su"].map((day) => (
                      <button
                        key={day}
                        className={`w-8 h-8 rounded-lg border text-xs font-semibold flex items-center justify-center ${formData.executionWindow?.activeDays?.includes(day) ? "bg-purple-600/20 border-purple-500 text-purple-400" : "bg-[#0a0a0f] border-[#2d2d3a] text-gray-400"}`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#1a1a24] border border-[#2d2d3a] rounded-xl p-4 text-center">
                <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Check className="w-5 h-5 text-green-400" />
                </div>
                <h3 className="font-bold text-white">Ready</h3>
                <p className="text-xs text-gray-400">Configuration Complete</p>
              </div>
              <div className="bg-[#1a1a24] border border-[#2d2d3a] rounded-xl p-4 text-center">
                <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-purple-400 font-bold">
                    {formData.schedule}
                  </span>
                </div>
                <h3 className="font-bold text-white">Cron Schedule</h3>
                <p className="text-xs text-gray-400">Based on UTC</p>
              </div>
              <div className="bg-[#1a1a24] border border-[#2d2d3a] rounded-xl p-4 text-center">
                <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-blue-400 font-bold ">
                    {formData.sink?.type === "mongo" ? "ON" : "OFF"}
                  </span>
                </div>
                <h3 className="font-bold text-white">Data Sink</h3>
                <p className="text-xs text-gray-400">
                  {formData.sink?.type ? "MongoDB Configured" : "Disabled"}
                </p>
              </div>
            </div>

            <div className="bg-[#1a1a24] border border-[#2d2d3a] rounded-xl p-0 overflow-hidden text-sm">
              <div className="flex justify-between p-4 border-b border-[#2d2d3a]">
                <span className="text-gray-400">Job Name</span>
                <span className="font-medium text-white">
                  {formData.name || "Unnamed Job"}
                </span>
              </div>
              <div className="flex justify-between p-4 border-b border-[#2d2d3a]">
                <span className="text-gray-400">Job Type</span>
                <span className="font-medium text-white">
                  {formData.type === "http" ? "HTTP Webhook" : "Remote Shell"}
                </span>
              </div>
              <div className="flex justify-between p-4 border-b border-[#2d2d3a]">
                <span className="text-gray-400">Priority</span>
                <span className="font-medium text-yellow-400">
                  {formData.priority}
                </span>
              </div>
              <div className="flex justify-between p-4 border-b border-[#2d2d3a]">
                <span className="text-gray-400">Auto Retry</span>
                <span
                  className={`font-medium ${(formData.retryLimit ?? 0) > 0 ? "text-green-400" : "text-gray-500"}`}
                >
                  {(formData.retryLimit ?? 0) > 0
                    ? `Yes (${formData.retryLimit})`
                    : "Disabled"}
                </span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#111118] border border-[#23232f] rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1a1a24]">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
              Create New Job
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Configure your automated job with advanced options
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-[#1a1a24] rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 pt-6 mb-2">
          <div className="flex justify-between items-center relative">
            <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-[#23232f] -z-10 -translate-y-1/2" />

            {steps.map((label, index) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 bg-[#111118] px-2"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors font-medium text-sm
                    ${
                      currentStep > index
                        ? "bg-blue-600 text-white"
                        : currentStep === index
                          ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                          : "bg-[#1a1a24] text-gray-500 border border-[#2d2d3a]"
                    }
                  `}
                >
                  {currentStep > index ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`text-xs ${currentStep === index ? "text-purple-400 font-medium" : "text-gray-500"}`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6 flex-1 overflow-y-auto">{renderStepContent()}</div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-[#1a1a24] flex items-center justify-between bg-[#0a0a0f] rounded-b-2xl">
          <button
            onClick={() => setCurrentStep((p) => Math.max(0, p - 1))}
            disabled={currentStep === 0}
            className="px-6 py-2.5 text-sm font-medium text-gray-400 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg hover:text-white disabled:opacity-50 transition-colors"
          >
            ← Previous
          </button>

          <div className="flex gap-3">
            <button className="px-6 py-2.5 text-sm font-medium text-gray-300 bg-[#1a1a24] border border-[#2d2d3a] rounded-lg hover:bg-[#23232f] transition-colors">
              Save as Draft
            </button>
            {currentStep < steps.length - 1 ? (
              <button
                onClick={() => setCurrentStep((p) => p + 1)}
                className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all"
              >
                Next Step →
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={isSubmitting}
                className="px-8 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-[0_0_20px_rgba(168,85,247,0.6)] disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {isSubmitting ? "Deploying..." : "Create Job →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
