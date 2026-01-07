import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/components/auth-context'

export function useAuthGuard(options?: { requireOnboarding?: boolean }) {
	const navigate = useNavigate()
	const { isLoading, isAuthenticated, user } = useAuth()

	useEffect(() => {
		if (isLoading) {
			return
		}
		if (!isAuthenticated) {
			navigate({ to: '/sign-in' })
			return
		}
		if (options?.requireOnboarding && !user?.onboardingDone) {
			navigate({ to: '/onboarding' })
		}
	}, [isLoading, isAuthenticated, user, navigate, options?.requireOnboarding])
}

export function useOnboardingGuard() {
	const navigate = useNavigate()
	const { isLoading, isAuthenticated, user } = useAuth()

	useEffect(() => {
		if (isLoading) {
			return
		}
		if (!isAuthenticated) {
			navigate({ to: '/sign-in' })
			return
		}
		if (user?.onboardingDone) {
			navigate({ to: '/dashboard' })
		}
	}, [isLoading, isAuthenticated, user, navigate])
}
