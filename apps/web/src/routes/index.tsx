import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Skeleton } from '@/components/skeleton'
import { useAuth } from '@/components/auth-context'

export const Route = createFileRoute('/')({
	component: IndexComponent,
})

function IndexComponent() {
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
		if (!user?.onboardingDone) {
			navigate({ to: '/onboarding' })
			return
		}
		navigate({ to: '/dashboard' })
	}, [isLoading, isAuthenticated, user, navigate])

	return (
		<div className="flex min-h-[60vh] items-center justify-center">
			<div className="w-full max-w-sm space-y-4">
				<Skeleton className="h-8" />
				<Skeleton className="h-4" />
				<Skeleton className="h-4" />
			</div>
		</div>
	)
}
