import axios from "axios";

const api = axios.create({
  baseURL: "/",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("axon_token");
  if (token) {
    config.headers.Authorization = "Bearer " + token;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 400) {
      localStorage.removeItem("axon_token");
      localStorage.removeItem("axon_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export const authAPI = {
  login: (data: { email: string; password: string }) =>
    api.post("/user/login", data),
  register: (data: {
    username: string;
    email: string;
    password: string;
    orgName: string;
    orgDescription?: string;
  }) => api.post("/user/register", data),
};

export const jobsAPI = {
  getAll: () => api.get("/jobs/getJobs"),
  getById: (id: string) => api.get("/jobs/getJobById/" + id),
  create: (data: Record<string, unknown>) => api.post("/jobs/createJob", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put("/jobs/updateJob/" + id, data),
  delete: (id: string) => api.delete("/jobs/deleteJob/" + id),
  toggle: (id: string) => api.patch("/jobs/toggleJobStatus/" + id),
  runNow: (id: string) => api.post("/jobs/runJobNow/" + id),
};

export const agentsAPI = {
  getAll: () => api.get("/agents/getAgents"),
  getById: (id: string) => api.get("/agents/getAgent/" + id),
};

export const adminAPI = {
  health: () => api.get("/admin/health"),
  jobStats: () => api.get("/admin/job-stats"),
  userStats: () => api.get("/admin/user-stats"),
  allJobs: () => api.get("/admin/all-jobs"),
  allUsers: () => api.get("/admin/all-users"),
};

export default api;
