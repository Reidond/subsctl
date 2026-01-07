import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/components/auth-context'
import { authClient } from '@/lib/auth-client'
import { useToast } from '@/components/toast'

export const Route = createFileRoute('/sign-in')({
	component: SignInPage,
})

function SignInPage() {
	const { isAuthenticated } = useAuth()
	const [loading, setLoading] = useState(false)
	const navigate = useNavigate()
	const toast = useToast()

	useEffect(() => {
		if (isAuthenticated) {
			navigate({ to: '/dashboard' })
		}
	}, [isAuthenticated, navigate])

	const handleSignIn = async () => {
		try {
			setLoading(true)
			await authClient.signIn.social({ provider: 'google' })
		} catch (error) {
			console.error('Failed to sign in', error)
			toast.push({
				title: 'Sign-in failed',
				description: 'Please try again in a moment.',
			})
			setLoading(false)
		}
	}

	return (
		<div className="flex min-h-[70vh] items-center justify-center px-4">
			<Card className="w-full max-w-xl overflow-hidden border-border/60 bg-gradient-to-br from-card to-muted/40 p-8 shadow-xl">
				<div className="flex flex-col gap-6">
					<div className="space-y-3">
						<div className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
							Personal subscription tracker
						</div>
						<h1 className="text-3xl font-semibold">Welcome back</h1>
						<p className="text-sm text-muted-foreground">
							Sign in with Google to track upcoming renewals, manage spend, and stay ahead of
							surprises.
						</p>
					</div>
					<div className="rounded-2xl border border-border bg-background/60 p-4">
						<Button className="w-full" variant="default" disabled={loading} onClick={handleSignIn}>
							{loading ? 'Redirecting…' : 'Continue with Google'}
						</Button>
						<p className="mt-3 text-xs text-muted-foreground">
							We only use your Google account to sign you in. No passwords stored.
						</p>
					</div>
				</div>
			</Card>
		</div>
	)
}
