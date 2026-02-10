import { create } from "zustand"

interface User {
  _id: string
  username: string
  email: string
  role: string
  orgId: string
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (user: User, token: string) => void
  logout: () => void
  initialize: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  login: (user, token) => {
    localStorage.setItem("axon_token", token)
    localStorage.setItem("axon_user", JSON.stringify(user))
    set({ user, token, isAuthenticated: true })
  },
  logout: () => {
    localStorage.removeItem("axon_token")
    localStorage.removeItem("axon_user")
    set({ user: null, token: null, isAuthenticated: false })
  },
  initialize: () => {
    const token = localStorage.getItem("axon_token")
    const userStr = localStorage.getItem("axon_user")
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        set({ user, token, isAuthenticated: true })
      } catch {
        set({ user: null, token: null, isAuthenticated: false })
      }
    }
  },
}))
