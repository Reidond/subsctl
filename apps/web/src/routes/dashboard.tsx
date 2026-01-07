import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/skeleton'
import { MarkPaidDialog } from '@/components/mark-paid-dialog'
import { useStatsSummary, useSubscriptions, useFxRates } from '@/lib/hooks'
import { useAuthGuard } from '@/lib/guards'
import { useAuth } from '@/components/auth-context'
import { useToast } from '@/components/toast'
import { Link } from '@tanstack/react-router'

const dayOptions = [
	{ label: 'Next 7 days', value: 7 },
	{ label: 'Next 30 days', value: 30 },
	{ label: 'Next 90 days', value: 90 },
]

export const Route = createFileRoute('/dashboard')({
	component: DashboardPage,
})

function DashboardPage() {
	useAuthGuard({ requireOnboarding: true })
	const { user } = useAuth()
	const toast = useToast()
	const { data: fxRates } = useFxRates()
	const [windowDays, setWindowDays] = useState(30)
	useEffect(() => {
		const stored = window.localStorage.getItem('dashboardWindow')
		if (stored) {
			setWindowDays(Number(stored))
		}
	}, [])
	useEffect(() => {
		if (!user?.onboardingDone) {
			return
		}
		const reminder = window.localStorage.getItem('onboardingSkipReminder')
		if (!reminder) {
			return
		}
		const suppress = window.sessionStorage.getItem('onboardingSkipReminderSuppress')
		if (suppress) {
			return
		}
		window.localStorage.removeItem('onboardingSkipReminder')
		toast.push({
			title: 'Add your first subscription',
			description: 'Set one up to see upcoming renewals and reminders.',
		})
	}, [toast, user?.onboardingDone])
	const { data: stats, isLoading: statsLoading } = useStatsSummary()
	const dateRange = useMemo(() => {
		const from = new Date()
		const to = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000)
		return { from: from.toISOString(), to: to.toISOString() }
	}, [windowDays])
	const { data: upcoming, isLoading } = useSubscriptions({
		status: 'active',
		from: dateRange.from,
		to: dateRange.to,
	})
	const primaryCurrency = user?.primaryCurrency ?? null
	const convertAmount = useCallback(
		(amountCents: number, currency: string) => {
			if (!primaryCurrency || !fxRates) {
				return { amount: amountCents / 100, currency, value: amountCents / 100 }
			}
			if (currency === primaryCurrency) {
				return { amount: amountCents / 100, currency, value: amountCents / 100 }
			}
			if (fxRates.base !== 'USD') {
				return { amount: amountCents / 100, currency, value: amountCents / 100 }
			}
			const toPrimary = fxRates.rates[primaryCurrency]
			const fromBase = fxRates.rates[currency]
			if (!toPrimary || !fromBase) {
				return { amount: amountCents / 100, currency, value: amountCents / 100 }
			}
			const rate = toPrimary / fromBase
			const converted = (amountCents * rate) / 100
			return { amount: converted, currency: primaryCurrency, value: converted }
		},
		[primaryCurrency, fxRates]
	)
	const upcomingItems = useMemo(() => {
		return (upcoming ?? []).slice().sort((a, b) => {
			const aValue = convertAmount(a.amount_cents, a.currency).value
			const bValue = convertAmount(b.amount_cents, b.currency).value
			return bValue - aValue
		})
	}, [upcoming, convertAmount])

	const handleWindowChange = (value: number) => {
		setWindowDays(value)
		window.localStorage.setItem('dashboardWindow', String(value))
	}

	return (
		<div className="space-y-8">
			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="p-5">
					<div className="text-xs text-muted-foreground">Monthly spend</div>
					<div className="mt-2 text-2xl font-semibold">
						{statsLoading ? (
							<Skeleton className="h-6" />
						) : (
							`$${(stats?.totals?.totalMonthlySpend ?? 0).toFixed(2)}`
						)}
					</div>
					<div className="mt-2 text-xs text-muted-foreground">
						Yearly projection:{' '}
						{statsLoading ? '—' : `$${(stats?.totals?.totalYearlyProjection ?? 0).toFixed(2)}`}
					</div>
				</Card>
				<Card className="p-5">
					<div className="text-xs text-muted-foreground">Active subscriptions</div>
					<div className="mt-2 text-2xl font-semibold">
						{statsLoading ? <Skeleton className="h-6" /> : (stats?.totals?.activeCount ?? 0)}
					</div>
					<div className="mt-2 text-xs text-muted-foreground">
						Paused: {statsLoading ? '—' : (stats?.totals?.pausedCount ?? 0)}
					</div>
				</Card>
				<Card className="p-5">
					<div className="text-xs text-muted-foreground">MoM change</div>
					<div className="mt-2 text-2xl font-semibold">
						{statsLoading ? (
							<Skeleton className="h-6" />
						) : (
							`${(stats?.totals?.monthOverMonthChange ?? 0).toFixed(2)}%`
						)}
					</div>
					<div className="mt-2 text-xs text-muted-foreground">Compared to last month</div>
				</Card>
			</div>
			<Card className="p-6">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<div className="text-lg font-semibold">Upcoming renewals</div>
						<p className="text-xs text-muted-foreground">Sorted by amount</p>
					</div>
					<Link to="/subscriptions/new">
						<Button size="sm">Add subscription</Button>
					</Link>
					<div className="flex flex-wrap gap-2">
						{dayOptions.map((option) => (
							<Button
								key={option.value}
								size="sm"
								variant={windowDays === option.value ? 'default' : 'secondary'}
								onClick={() => handleWindowChange(option.value)}
							>
								{option.label}
							</Button>
						))}
					</div>
				</div>
				<Separator className="my-4" />
				{isLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-10" />
						<Skeleton className="h-10" />
						<Skeleton className="h-10" />
					</div>
				) : upcomingItems.length > 0 ? (
					<div className="space-y-3">
						{upcomingItems.map((item) => {
							const converted = convertAmount(item.amount_cents, item.currency)
							return (
								<div
									key={item.id}
									className="flex flex-col gap-3 rounded-xl border border-border/60 px-4 py-3 md:flex-row md:items-center md:justify-between"
								>
									<div>
										<div className="text-sm font-semibold">{item.name}</div>
										<div className="text-xs text-muted-foreground">
											Renews {new Date(item.next_renewal_at).toLocaleDateString()}
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-3">
										<Badge variant="secondary">
											{converted.currency} {converted.amount.toFixed(2)}
										</Badge>
										<MarkPaidDialog subscription={item} />
									</div>
								</div>
							)
						})}
					</div>
				) : (
					<div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
						No renewals in this window. Try a wider range.
					</div>
				)}
			</Card>
			<Card className="p-6">
				<div className="text-lg font-semibold">Spend by category</div>
				<p className="text-xs text-muted-foreground">
					Overview based on primary currency conversion.
				</p>
				<Separator className="my-4" />
				{statsLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-8" />
						<Skeleton className="h-8" />
					</div>
				) : (
					<div className="space-y-2">
						{(stats?.byCategory ?? []).map((item) => (
							<div
								key={item.categoryId ?? 'uncategorized'}
								className="flex items-center justify-between text-sm"
							>
								<div>{item.categoryName}</div>
								<div className="text-muted-foreground">
									${item.amount.toFixed(2)} · {item.percentage.toFixed(1)}%
								</div>
							</div>
						))}
					</div>
				)}
			</Card>
		</div>
	)
}
