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
  login: (user: User) => void
  logout: () => void
  initialize: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => {
    set({ user, isAuthenticated: true })
  },
  logout: () => {
    set({ user: null, isAuthenticated: false })
  },
  initialize: () => {
    set((state) => ({ ...state }))
  },
}))
