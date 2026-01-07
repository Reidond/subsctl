import { useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { CreditCard, LayoutDashboard, Menu, Settings, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/components/auth-context'
import { authClient } from '@/lib/auth-client'
import { useToast } from '@/components/toast'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'

const navItems = [
	{
		label: 'Dashboard',
		to: '/dashboard',
		icon: LayoutDashboard,
	},
	{
		label: 'Subscriptions',
		to: '/subscriptions',
		icon: CreditCard,
	},
	{
		label: 'Categories',
		to: '/categories',
		icon: Tag,
	},
	{
		label: 'Settings',
		to: '/settings',
		icon: Settings,
	},
]

function NavList({ onNavigate }: { onNavigate?: () => void }) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	})

	return (
		<nav className="flex flex-col gap-1">
			{navItems.map((item) => {
				const active = pathname.startsWith(item.to)
				const Icon = item.icon
				return (
					<Link
						key={item.to}
						to={item.to}
						onClick={onNavigate}
						className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
							active
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:bg-muted hover:text-foreground'
						}`}
					>
						<Icon className="h-4 w-4" />
						{item.label}
					</Link>
				)
			})}
		</nav>
	)
}

export function AppShell({ children }: { children: React.ReactNode }) {
	const { user, isAuthenticated } = useAuth()
	const [navOpen, setNavOpen] = useState(false)
	const [signingOut, setSigningOut] = useState(false)
	const toast = useToast()
	const queryClient = useQueryClient()

	const handleSignOut = async () => {
		try {
			setSigningOut(true)
			await authClient.signOut()
			window.sessionStorage.removeItem('onboardingSkipReminderSuppress')
			await queryClient.invalidateQueries({ queryKey: queryKeys.me() })
		} catch (error) {
			console.error(error)
			toast.push({ title: 'Sign out failed', description: 'Please try again.' })
		} finally {
			setSigningOut(false)
		}
	}

	if (!isAuthenticated || !user?.onboardingDone) {
		return <div className="min-h-screen bg-background text-foreground">{children}</div>
	}

	return (
		<div className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex min-h-screen w-full max-w-[1400px]">
				<aside className="hidden w-64 flex-col border-r border-border bg-sidebar px-4 py-6 lg:flex">
					<div className="flex items-center gap-2 text-lg font-semibold">
						<div className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground">
							S
						</div>
						subsctl
					</div>
					<div className="mt-6 flex flex-1 flex-col gap-6">
						<NavList />
						<Separator />
						<div className="text-xs text-muted-foreground">
							{isAuthenticated ? `Signed in as ${user?.email}` : 'Not signed in'}
						</div>
					</div>
				</aside>
				<div className="flex w-full flex-1 flex-col">
					<header className="flex items-center justify-between border-b border-border px-4 py-4 lg:px-10">
						<div className="flex items-center gap-3">
							<Button
								className="lg:hidden"
								size="icon"
								variant="outline"
								onClick={() => setNavOpen(true)}
							>
								<Menu className="h-4 w-4" />
							</Button>
							<div>
								<div className="text-sm text-muted-foreground">Welcome back</div>
								<div className="text-lg font-semibold">{user?.name ?? 'Subscriptions'}</div>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Link to="/subscriptions/new">
								<Button size="sm">Add subscription</Button>
							</Link>
							{isAuthenticated && (
								<Button size="sm" variant="ghost" disabled={signingOut} onClick={handleSignOut}>
									{signingOut ? 'Signing out…' : 'Sign out'}
								</Button>
							)}
						</div>
					</header>
					<main className="flex-1 px-4 py-6 lg:px-10">{children}</main>
				</div>
			</div>
			{navOpen && (
				<div className="fixed inset-0 z-50 flex lg:hidden">
					<button
						className="absolute inset-0 bg-black/40"
						onClick={() => setNavOpen(false)}
						type="button"
					></button>
					<div className="relative z-10 h-full w-72 bg-sidebar px-4 py-6">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2 text-lg font-semibold">
								<div className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground">
									S
								</div>
								subsctl
							</div>
							<Button size="sm" variant="ghost" onClick={() => setNavOpen(false)}>
								Close
							</Button>
						</div>
						<div className="mt-6 flex flex-col gap-6">
							<NavList onNavigate={() => setNavOpen(false)} />
							<Separator />
							<div className="text-xs text-muted-foreground">
								{isAuthenticated ? `Signed in as ${user?.email}` : 'Not signed in'}
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
