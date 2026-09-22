export interface AuthUser {
  avatar?: string
  id: string
  name: string
  permissions: string[]
  roles: string[]
}

export interface AuthSession {
  accessToken: string
  expiresAt?: number
  refreshToken?: string
  user: AuthUser
}

export interface LoginCredentials {
  password: string
  username: string
}
