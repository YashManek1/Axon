export interface HttpPayload {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
}

export interface ShellPayload {
    command: string;
}

export interface JobNotifications {
    onSuccess: boolean;
    onFailure: boolean;
    recipients: string[];
}

export interface JobExecutionWindow {
    enabled: boolean;
    startTime: string; // "HH:mm"
    endTime: string;   // "HH:mm"
    activeDays: string[]; // ["M", "T", "W"]
}

export interface JobSink {
    type: "mongo" | null;
    uri: string | null;
    databaseName: string | null;
    collectionName: string | null;
    exportFormat: string[];
    encryptionAlg: string;
}

export interface Job {
    _id?: string;
    userId?: string;
    name: string;
    description: string;
    category: string;
    priority: "Low" | "Medium" | "High";
    tags: string[];
    type: "http" | "shell";
    timeout: number;
    notifications: JobNotifications;
    executionWindow: JobExecutionWindow;
    scheduleType: "Cron" | "Interval" | "Once";
    schedule: string;
    timezone: string;
    payload: HttpPayload | ShellPayload | Record<string, unknown>;
    enabled: boolean;
    retryLimit: number;
    webhookUrl: string | null;
    sink: JobSink;
    status: "active" | "paused";
    nextRunAt?: string | null;
    createdAt?: string;
}
