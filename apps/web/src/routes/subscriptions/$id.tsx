import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/skeleton'
import { MarkPaidDialog } from '@/components/mark-paid-dialog'
import {
	useArchiveSubscription,
	usePauseSubscription,
	useResumeSubscription,
	useSnoozeNotification,
	useSubscription,
	useSubscriptionEvents,
} from '@/lib/hooks'
import { useToast } from '@/components/toast'
import { useAuthGuard } from '@/lib/guards'

export const Route = createFileRoute('/subscriptions/$id')({
	component: SubscriptionDetailPage,
})

function SubscriptionDetailPage() {
	useAuthGuard({ requireOnboarding: true })
	const navigate = useNavigate()
	const toast = useToast()
	const { id } = Route.useParams()
	const { data: subscription, isLoading, isError } = useSubscription(id)
	const { data: events, isLoading: eventsLoading } = useSubscriptionEvents(id)
	const archiveMutation = useArchiveSubscription(id)
	const pauseMutation = usePauseSubscription(id)
	const resumeMutation = useResumeSubscription(id)
	const snoozeMutation = useSnoozeNotification()
	const [resumeDate, setResumeDate] = useState(() => new Date().toISOString().slice(0, 16))

	if (isError) {
		return (
			<Card className="p-6">
				<div className="text-sm font-semibold">Subscription not found</div>
				<p className="mt-2 text-sm text-muted-foreground">
					We couldn’t load this subscription. It may have been removed.
				</p>
				<Button
					className="mt-4"
					variant="secondary"
					onClick={() => navigate({ to: '/subscriptions' })}
				>
					Back to subscriptions
				</Button>
			</Card>
		)
	}

	if (isLoading || !subscription) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-10" />
				<Skeleton className="h-40" />
			</div>
		)
	}

	const handleArchive = async () => {
		try {
			await archiveMutation.mutateAsync(undefined)
			toast.push({ title: 'Subscription archived', description: subscription.name })
			navigate({ to: '/subscriptions' })
		} catch (error) {
			console.error(error)
			toast.push({
				title: 'Failed to archive',
				description: 'Please try again.',
			})
		}
	}

	const handlePause = async () => {
		try {
			await pauseMutation.mutateAsync(undefined)
			toast.push({ title: 'Subscription paused' })
		} catch (error) {
			console.error(error)
			toast.push({
				title: 'Failed to pause',
				description: 'Please try again.',
			})
		}
	}

	const handleResume = async () => {
		const parsed = new Date(resumeDate)
		if (Number.isNaN(parsed.valueOf())) {
			toast.push({
				title: 'Invalid renewal date',
				description: 'Please select a valid date.',
			})
			return
		}
		try {
			await resumeMutation.mutateAsync({
				next_renewal_at: parsed.toISOString(),
			})
			toast.push({ title: 'Subscription resumed' })
		} catch (error) {
			console.error(error)
			toast.push({
				title: 'Failed to resume',
				description: 'Please try again.',
			})
		}
	}

	const handleSnooze = async () => {
		try {
			await snoozeMutation.mutateAsync({ subscriptionId: id })
			toast.push({ title: 'Notifications snoozed', description: 'We will remind you tomorrow.' })
		} catch (error) {
			console.error(error)
			toast.push({ title: 'Failed to snooze', description: 'Please try again.' })
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold">{subscription.name}</h1>
					<p className="text-sm text-muted-foreground">
						Next renewal {new Date(subscription.next_renewal_at).toLocaleString()}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<MarkPaidDialog subscription={subscription} />
					{subscription.status !== 'archived' && (
						<Button variant="secondary" disabled={snoozeMutation.isPending} onClick={handleSnooze}>
							Snooze 1 day
						</Button>
					)}
					<Button variant="secondary" onClick={handleArchive}>
						Archive
					</Button>
				</div>
			</div>
			<Card className="grid gap-4 p-6 md:grid-cols-2">
				<div>
					<div className="text-xs text-muted-foreground">Amount</div>
					<div className="text-lg font-semibold">
						{subscription.currency} {(subscription.amount_cents / 100).toFixed(2)}
					</div>
				</div>
				<div>
					<div className="text-xs text-muted-foreground">Cadence</div>
					<div className="text-sm font-medium">
						Every {subscription.cadence_count} {subscription.cadence_unit}
						{subscription.cadence_count > 1 ? 's' : ''}
					</div>
				</div>
				<div>
					<div className="text-xs text-muted-foreground">Status</div>
					<div className="text-sm font-medium capitalize">{subscription.status}</div>
				</div>
				<div>
					<div className="text-xs text-muted-foreground">Notes</div>
					<div className="text-sm text-muted-foreground">{subscription.notes || '—'}</div>
				</div>
				<div className="md:col-span-2">
					<Separator className="my-3" />
					<div className="flex flex-wrap items-center gap-3">
						{subscription.status === 'paused' ? (
							<>
								<input
									type="datetime-local"
									className="h-9 rounded-xl border border-border bg-transparent px-3 text-sm"
									value={resumeDate}
									onChange={(event) => setResumeDate(event.target.value)}
								/>
								<Button onClick={handleResume}>Resume</Button>
							</>
						) : (
							<Button variant="secondary" onClick={handlePause}>
								Pause
							</Button>
						)}
					</div>
				</div>
			</Card>
			<Card className="p-6">
				<div className="text-lg font-semibold">Payment history</div>
				<Separator className="my-4" />
				{eventsLoading ? (
					<Skeleton className="h-10" />
				) : events && events.length > 0 ? (
					<div className="space-y-2">
						{events.map((event) => (
							<div key={event.id} className="flex items-center justify-between text-sm">
								<div>
									{new Date(event.occurred_at).toLocaleDateString()}
									<span className="ml-2 text-xs text-muted-foreground">{event.note ?? ''}</span>
								</div>
								<div>
									{event.currency} {(event.amount_cents / 100).toFixed(2)}
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="text-sm text-muted-foreground">No payment history yet.</div>
				)}
			</Card>
		</div>
	)
}
