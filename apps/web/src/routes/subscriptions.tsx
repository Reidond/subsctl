import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/skeleton'
import { MarkPaidDialog } from '@/components/mark-paid-dialog'
import { ApiError } from '@/lib/api'
import { useArchiveSubscription, useFxRates, useSubscriptions } from '@/lib/hooks'
import { useAuthGuard } from '@/lib/guards'
import { useAuth } from '@/components/auth-context'
import { useToast } from '@/components/toast'
import type { Subscription } from '@/lib/types'

const statusTabs = [
	{ label: 'Active', value: 'active' },
	{ label: 'Paused', value: 'paused' },
	{ label: 'Archived', value: 'archived' },
	{ label: 'All', value: 'all' },
]

export const Route = createFileRoute('/subscriptions')({
	component: SubscriptionsLayout,
})

function SubscriptionsLayout() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	})
	const showList = pathname === '/subscriptions'

	return showList ? <SubscriptionsList /> : <Outlet />
}

function SubscriptionsList() {
	useAuthGuard({ requireOnboarding: true })
	const toast = useToast()
	const { user } = useAuth()
	const { data: fxRates } = useFxRates()
	const [status, setStatus] = useState('active')
	const [query, setQuery] = useState('')
	const [search, setSearch] = useState('')
	useEffect(() => {
		const timer = window.setTimeout(() => {
			setSearch(query.trim())
		}, 300)
		return () => window.clearTimeout(timer)
	}, [query])
	const { data, isLoading, isError, error, refetch } = useSubscriptions({
		status,
		q: search,
	})
	const searchUnavailable = error instanceof ApiError && error.message === 'Search unavailable'

	const items = useMemo(() => data ?? [], [data])
	const primaryCurrency = user?.primaryCurrency ?? null
	const convertAmount = (
		amountCents: number,
		currency: string
	): { amount: number; currency: string } => {
		if (!primaryCurrency || !fxRates) {
			return { amount: amountCents / 100, currency }
		}
		if (currency === primaryCurrency) {
			return { amount: amountCents / 100, currency }
		}
		if (fxRates.base !== 'USD') {
			return { amount: amountCents / 100, currency }
		}
		const toPrimary = fxRates.rates[primaryCurrency]
		const fromBase = fxRates.rates[currency]
		if (!toPrimary || !fromBase) {
			return { amount: amountCents / 100, currency }
		}
		const rate = toPrimary / fromBase
		return { amount: (amountCents * rate) / 100, currency: primaryCurrency }
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold">Subscriptions</h1>
					<p className="text-sm text-muted-foreground">
						Manage recurring charges and payment history.
					</p>
				</div>
				<Link to="/subscriptions/new">
					<Button>Add subscription</Button>
				</Link>
			</div>
			<div className="flex flex-wrap gap-2">
				{statusTabs.map((tab) => (
					<Button
						key={tab.value}
						size="sm"
						variant={status === tab.value ? 'default' : 'secondary'}
						onClick={() => setStatus(tab.value)}
					>
						{tab.label}
					</Button>
				))}
			</div>
			<Card className="p-4">
				<Input
					placeholder="Search subscriptions"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
				/>
			</Card>
			{isError ? (
				<Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
					<div className="space-y-3">
						<div>
							{searchUnavailable
								? 'Search is unavailable in this environment.'
								: 'Something went wrong while loading subscriptions.'}
						</div>
						<div className="flex flex-wrap justify-center gap-2">
							{searchUnavailable ? (
								<Button variant="secondary" onClick={() => setQuery('')}>
									Clear search
								</Button>
							) : (
								<Button variant="secondary" onClick={() => refetch()}>
									Retry
								</Button>
							)}
						</div>
					</div>
				</Card>
			) : isLoading ? (
				<div className="space-y-3">
					<Skeleton className="h-12" />
					<Skeleton className="h-12" />
					<Skeleton className="h-12" />
				</div>
			) : items.length > 0 ? (
				<div className="space-y-3">
					{items.map((item) => (
						<SubscriptionRow
							key={item.id}
							item={item}
							convertAmount={convertAmount}
							primaryCurrency={primaryCurrency}
							searchActive={Boolean(search)}
							toast={toast}
						/>
					))}
				</div>
			) : (
				<Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
					No subscriptions found. Try a different filter.
				</Card>
			)}
		</div>
	)
}

function SubscriptionRow({
	item,
	convertAmount,
	primaryCurrency,
	searchActive,
	toast,
}: {
	item: Subscription
	convertAmount: (
		amountCents: number,
		currency: string
	) => {
		amount: number
		currency: string
	}
	primaryCurrency: string | null
	searchActive: boolean
	toast: ReturnType<typeof useToast>
}) {
	const archiveMutation = useArchiveSubscription(item.id)
	const converted = convertAmount(item.amount_cents, item.currency)
	const showConverted = primaryCurrency && converted.currency === primaryCurrency
	const handleArchive = async () => {
		try {
			await archiveMutation.mutateAsync(undefined)
			toast.push({ title: 'Subscription archived', description: item.name })
		} catch (error) {
			console.error(error)
			toast.push({ title: 'Failed to archive', description: 'Please try again.' })
		}
	}

	return (
		<Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
			<div>
				<div className="flex items-center gap-2">
					<Link to="/subscriptions/$id" params={{ id: item.id }} className="text-sm font-semibold">
						{item.name}
					</Link>
					<Badge variant="secondary" className="capitalize">
						{item.status}
					</Badge>
				</div>
				<div className="text-xs text-muted-foreground">
					Next renewal {new Date(item.next_renewal_at).toLocaleDateString()}
					{searchActive && item.status === 'archived' ? ' · Archived match' : ''}
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-3">
				<div className="text-sm font-medium">
					{converted.currency} {converted.amount.toFixed(2)}
					{!showConverted ? null : null}
				</div>
				<MarkPaidDialog subscription={item} />
				<Button variant="ghost" size="sm" onClick={handleArchive}>
					Archive
				</Button>
				<Link
					to="/subscriptions/$id"
					params={{ id: item.id }}
					className="text-xs text-muted-foreground"
				>
					View
				</Link>
			</div>
		</Card>
	)
}
