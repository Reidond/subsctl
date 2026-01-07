import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/skeleton'
import { useAuth } from '@/components/auth-context'
import {
	downloadSubscriptionsCsv,
	useFxRates,
	usePushSubscribe,
	usePushUnsubscribe,
	useDeleteSession,
	useSessions,
	useUpdateSettings,
} from '@/lib/hooks'
import { useToast } from '@/components/toast'
import { authClient } from '@/lib/auth-client'
import { useAuthGuard } from '@/lib/guards'
import { queryKeys } from '@/lib/queryKeys'
import type { SubscriptionStatus } from '@/lib/types'

const currencyOptions = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'UAH']

export const Route = createFileRoute('/settings')({
	component: SettingsPage,
})

function SettingsPage() {
	useAuthGuard({ requireOnboarding: true })
	const { user } = useAuth()
	const toast = useToast()
	const queryClient = useQueryClient()
	const updateSettings = useUpdateSettings()
	const { data: fxRates } = useFxRates()
	const { data: sessions, isLoading } = useSessions()
	const deleteSession = useDeleteSession()
	const [revokingId, setRevokingId] = useState<string | null>(null)
	const [currency, setCurrency] = useState(user?.primaryCurrency ?? 'USD')
	const [timezone, setTimezone] = useState(user?.timezone ?? '')
	const [pushEnabled, setPushEnabled] = useState(false)
	const [exportStatuses, setExportStatuses] = useState<SubscriptionStatus[]>([
		'active',
		'paused',
		'archived',
	])
	const pushSubscribe = usePushSubscribe()
	const pushUnsubscribe = usePushUnsubscribe()

	useEffect(() => {
		setCurrency(user?.primaryCurrency ?? 'USD')
		setTimezone(user?.timezone ?? '')
		setPushEnabled(Boolean(user?.pushEnabled))
	}, [user])

	const handleSave = async () => {
		try {
			await updateSettings.mutateAsync({
				primaryCurrency: currency,
				timezone: timezone || undefined,
				pushEnabled,
			})
			toast.push({ title: 'Settings updated' })
		} catch (error) {
			console.error(error)
			toast.push({ title: 'Failed to update settings' })
		}
	}

	const handlePushToggle = async () => {
		try {
			if (!('Notification' in window)) {
				throw new Error('Notifications not supported')
			}
			if (!('serviceWorker' in navigator)) {
				throw new Error('Service worker not available')
			}
			const registration = await navigator.serviceWorker.ready
			const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
			if (!vapidKey) {
				throw new Error('Missing VAPID key')
			}
			const applicationServerKey = urlBase64ToUint8Array(vapidKey)
			if (!pushEnabled) {
				if (Notification.permission === 'denied') {
					toast.push({
						title: 'Notifications blocked',
						description: 'Enable notifications in your browser settings.',
					})
					return
				}
				if (Notification.permission === 'default') {
					const permission = await Notification.requestPermission()
					if (permission !== 'granted') {
						toast.push({
							title: 'Permission required',
							description: 'Allow notifications to enable reminders.',
						})
						return
					}
				}
				const subscription = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey,
				})
				const json = subscription.toJSON()
				await pushSubscribe.mutateAsync({
					endpoint: subscription.endpoint,
					p256dh: json.keys?.p256dh ?? '',
					auth: json.keys?.auth ?? '',
				})
				setPushEnabled(true)
				toast.push({ title: 'Push enabled' })
			} else {
				const subscription = await registration.pushManager.getSubscription()
				await pushUnsubscribe.mutateAsync(subscription?.endpoint)
				if (subscription) {
					await subscription.unsubscribe()
				}
				setPushEnabled(false)
				toast.push({ title: 'Push disabled' })
			}
		} catch (error) {
			console.error(error)
			toast.push({
				title: 'Push setup failed',
				description: 'Check notification permissions.',
			})
		}
	}

	const exportOptions = useMemo(() => ['active', 'paused', 'archived'] as const, [])
	const toggleExportStatus = (status: SubscriptionStatus) => {
		setExportStatuses((current) =>
			current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
		)
	}

	const handleSignOut = async () => {
		try {
			await authClient.signOut()
			window.sessionStorage.removeItem('onboardingSkipReminderSuppress')
			await queryClient.invalidateQueries({ queryKey: queryKeys.me() })
		} catch (error) {
			console.error(error)
			toast.push({ title: 'Sign out failed', description: 'Please try again.' })
		}
	}

	const handleRevokeSession = async (id: string) => {
		try {
			setRevokingId(id)
			await deleteSession.mutateAsync(id)
			toast.push({ title: 'Session revoked' })
		} catch (error) {
			console.error(error)
			toast.push({ title: 'Failed to revoke session' })
		} finally {
			setRevokingId(null)
		}
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold">Settings</h1>
				<p className="text-sm text-muted-foreground">Manage profile and preferences.</p>
			</div>
			<Card className="grid gap-6 p-6 md:grid-cols-2">
				<div>
					<div className="text-xs text-muted-foreground">Profile</div>
					<div className="mt-1 text-sm font-semibold">{user?.name}</div>
					<div className="text-xs text-muted-foreground">{user?.email}</div>
				</div>
				<div className="space-y-2">
					<label className="text-xs text-muted-foreground">Timezone</label>
					<Input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
				</div>
				<div className="space-y-2">
					<label className="text-xs text-muted-foreground">Primary currency</label>
					<Select value={currency} onValueChange={setCurrency}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select currency" />
						</SelectTrigger>
						<SelectContent>
							{currencyOptions.map((code) => (
								<SelectItem key={code} value={code}>
									{code}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{fxRates?.isStale && <p className="text-xs text-amber-600">FX rates are stale</p>}
				</div>
				<div className="space-y-2">
					<label className="text-xs text-muted-foreground">Push notifications</label>
					<Button variant="secondary" onClick={handlePushToggle}>
						{pushEnabled ? 'Disable push' : 'Enable push'}
					</Button>
				</div>
				<div className="md:col-span-2 flex gap-2">
					<Button onClick={handleSave} disabled={updateSettings.isPending}>
						Save changes
					</Button>
					<Button variant="ghost" onClick={handleSignOut}>
						Sign out
					</Button>
				</div>
			</Card>
			<Card className="p-6">
				<div className="text-lg font-semibold">Sessions</div>
				<p className="text-xs text-muted-foreground">Active devices logged in.</p>
				<div className="mt-4 space-y-2">
					{isLoading ? (
						<Skeleton className="h-10" />
					) : sessions && sessions.length > 0 ? (
						sessions.map((session) => (
							<div key={session.id} className="flex items-center justify-between text-sm">
								<div>
									{session.device_info ?? 'Unknown device'}
									<div className="text-xs text-muted-foreground">
										Last used {new Date(session.last_used).toLocaleString()}
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									disabled={deleteSession.isPending && revokingId === session.id}
									onClick={() => handleRevokeSession(session.id)}
								>
									{revokingId === session.id ? 'Revoking…' : 'Revoke'}
								</Button>
							</div>
						))
					) : (
						<div className="text-sm text-muted-foreground">No sessions found.</div>
					)}
				</div>
			</Card>
			<Card className="p-6">
				<div className="text-lg font-semibold">Export data</div>
				<p className="text-xs text-muted-foreground">Download subscriptions as CSV.</p>
				<div className="mt-4 space-y-3">
					<div className="flex flex-wrap gap-4">
						{exportOptions.map((status) => (
							<Label key={status} className="flex items-center gap-2 text-sm capitalize">
								<input
									type="checkbox"
									className="accent-primary h-4 w-4"
									checked={exportStatuses.includes(status)}
									onChange={() => toggleExportStatus(status)}
								/>
								{status}
							</Label>
						))}
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="secondary"
							disabled={exportStatuses.length === 0}
							onClick={() => downloadSubscriptionsCsv(exportStatuses)}
						>
							Export selected
						</Button>
						<Button
							variant="ghost"
							onClick={() => setExportStatuses(['active', 'paused', 'archived'])}
						>
							Select all
						</Button>
					</div>
				</div>
			</Card>
		</div>
	)
}

function urlBase64ToUint8Array(base64String: string) {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
	const raw = window.atob(base64)
	const outputArray = new Uint8Array(raw.length)
	for (let i = 0; i < raw.length; i += 1) {
		outputArray[i] = raw.charCodeAt(i)
	}
	return outputArray
}
