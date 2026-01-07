import { createContext, useContext } from 'react'
import { useMe } from '@/lib/hooks'
import { ApiError } from '@/lib/api'
import type { UserProfile } from '@/lib/types'

interface AuthContextValue {
	user: UserProfile | null
	isLoading: boolean
	isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue>({
	user: null,
	isLoading: true,
	isAuthenticated: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const { data, isLoading, error } = useMe()
	const authError = error instanceof ApiError && (error.status === 401 || error.status === 403)
	const user = authError ? null : (data ?? null)
	return (
		<AuthContext.Provider
			value={{
				user,
				isLoading,
				isAuthenticated: Boolean(user),
			}}
		>
			{children}
		</AuthContext.Provider>
	)
}

export function useAuth() {
	return useContext(AuthContext)
}
