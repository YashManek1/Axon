import { create } from "zustand"

export interface User {
  _id: string
  username: string
  email: string
  role: string
  orgId: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  /**
   * True until the session-restore attempt on page load has settled.
   * Without this, a reload renders with an empty in-memory store and the
   * protected routes redirect to /login before the refresh call can resolve,
   * which logged the user out on every refresh and broke every deep link.
   */
  isBootstrapping: boolean
  login: (user: User) => void
  logout: () => void
  finishBootstrap: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isBootstrapping: true,
  login: (user) => {
    set({ user, isAuthenticated: true, isBootstrapping: false })
  },
  logout: () => {
    set({ user: null, isAuthenticated: false, isBootstrapping: false })
  },
  finishBootstrap: () => {
    set({ isBootstrapping: false })
  },
}))
