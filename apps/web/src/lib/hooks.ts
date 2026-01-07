import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { buildQuery, fetchJson } from './api'
import { queryKeys } from './queryKeys'
import type {
	Category,
	FxRatesSnapshot,
	SessionItem,
	StatsSummary,
	Subscription,
	SubscriptionEvent,
	SubscriptionStatus,
	UserProfile,
} from './types'

export function useMe() {
	return useQuery({
		queryKey: queryKeys.me(),
		queryFn: async () => {
			const response = await fetchJson<{ user: UserProfile }>('/api/me')
			return response.user
		},
		retry: false,
		staleTime: 0,
	})
}

export function useSessions() {
	return useQuery({
		queryKey: queryKeys.sessions(),
		queryFn: async () => {
			const response = await fetchJson<{ items: SessionItem[] }>('/api/sessions')
			return response.items
		},
	})
}

export function useDeleteSession() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async (id: string) => {
			await fetchJson(`/api/sessions/${id}`, { method: 'DELETE' })
		},
		onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.sessions() }),
	})
}

export function useSubscriptions(params: {
	status?: string
	q?: string
	from?: string
	to?: string
}) {
	return useQuery({
		queryKey: queryKeys.subscriptions(params),
		queryFn: async () => {
			const response = await fetchJson<{ items: Subscription[] }>(
				`/api/subscriptions${buildQuery({
					status: params.status,
					q: params.q,
					from: params.from,
					to: params.to,
				})}`
			)
			return response.items
		},
	})
}

export function useSubscription(id: string) {
	return useQuery({
		queryKey: queryKeys.subscription(id),
		queryFn: async () => {
			const response = await fetchJson<{ item: Subscription }>(`/api/subscriptions/${id}`)
			return response.item
		},
		enabled: Boolean(id),
	})
}

export function useSubscriptionEvents(id: string) {
	return useQuery({
		queryKey: queryKeys.subscriptionEvents(id),
		queryFn: async () => {
			const response = await fetchJson<{ items: SubscriptionEvent[] }>(
				`/api/subscriptions/${id}/events`
			)
			return response.items
		},
		enabled: Boolean(id),
	})
}

export function useCreateSubscription() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async (payload: Partial<Subscription>) => {
			const response = await fetchJson<{ item: Subscription }>('/api/subscriptions', {
				method: 'POST',
				body: payload,
			})
			return response.item
		},
		onSuccess: () => {
			client.invalidateQueries({ queryKey: ['subscriptions'] })
			client.invalidateQueries({ queryKey: queryKeys.stats() })
		},
	})
}

export function useUpdateSubscription(id: string) {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async (payload: Partial<Subscription>) => {
			const response = await fetchJson<{ item: Subscription }>(`/api/subscriptions/${id}`, {
				method: 'PUT',
				body: payload,
			})
			return response.item
		},
		onSuccess: () => {
			client.invalidateQueries({ queryKey: queryKeys.subscription(id) })
			client.invalidateQueries({ queryKey: ['subscriptions'] })
			client.invalidateQueries({ queryKey: queryKeys.stats() })
		},
	})
}

function useSubscriptionAction(
	id: string,
	path: string,
	method: 'POST' | 'PUT' | 'DELETE' = 'POST'
) {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async (payload?: Record<string, unknown>) => {
			const response = await fetchJson<{ item: Subscription }>(`/api/subscriptions/${id}/${path}`, {
				method,
				body: payload,
			})
			return response.item
		},
		onSuccess: () => {
			client.invalidateQueries({ queryKey: queryKeys.subscription(id) })
			client.invalidateQueries({ queryKey: ['subscriptions'] })
			client.invalidateQueries({ queryKey: queryKeys.stats() })
		},
	})
}

export function useArchiveSubscription(id: string) {
	return useSubscriptionAction(id, 'archive')
}

export function usePauseSubscription(id: string) {
	return useSubscriptionAction(id, 'pause')
}

export function useResumeSubscription(id: string) {
	return useSubscriptionAction(id, 'resume')
}

export function useRestoreSubscription(id: string) {
	return useSubscriptionAction(id, 'restore')
}

export function useMarkPaid(id: string) {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async (payload?: {
			occurred_at?: string
			amount_cents?: number
			note?: string
			next_renewal_at?: string
		}) => {
			const response = await fetchJson<{
				item: Subscription
				event: SubscriptionEvent
			}>(`/api/subscriptions/${id}/mark-paid`, {
				method: 'POST',
				body: payload ?? {},
			})
			return response
		},
		onSuccess: () => {
			client.invalidateQueries({ queryKey: queryKeys.subscription(id) })
			client.invalidateQueries({ queryKey: ['subscriptions'] })
			client.invalidateQueries({ queryKey: queryKeys.subscriptionEvents(id) })
			client.invalidateQueries({ queryKey: queryKeys.stats() })
		},
	})
}

export function useDuplicateCheck(name: string) {
	return useQuery({
		queryKey: ['duplicate-check', name],
		queryFn: async () => {
			const response = await fetchJson<{ duplicates: Subscription[] }>(
				`/api/subscriptions/check-duplicate${buildQuery({ name })}`
			)
			return response.duplicates
		},
		enabled: Boolean(name),
	})
}

export function useCategories() {
	return useQuery({
		queryKey: queryKeys.categories(),
		queryFn: async () => {
			const response = await fetchJson<{ items: Category[] }>('/api/categories')
			return response.items
		},
	})
}

export function useCreateCategory() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async (payload: { name: string; color?: string }) => {
			const response = await fetchJson<{ item: Category }>('/api/categories', {
				method: 'POST',
				body: payload,
			})
			return response.item
		},
		onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.categories() }),
	})
}

export function useUpdateCategory(id: string) {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async (payload: { name?: string; color?: string }) => {
			const response = await fetchJson<{ item: Category }>(`/api/categories/${id}`, {
				method: 'PUT',
				body: payload,
			})
			return response.item
		},
		onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.categories() }),
	})
}

export function useDeleteCategory(id: string) {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async () => {
			await fetchJson(`/api/categories/${id}`, { method: 'DELETE' })
		},
		onSuccess: () => {
			client.invalidateQueries({ queryKey: queryKeys.categories() })
			client.invalidateQueries({ queryKey: ['subscriptions'] })
		},
	})
}

export function useStatsSummary() {
	return useQuery({
		queryKey: queryKeys.stats(),
		queryFn: async () => {
			const response = await fetchJson<
				| StatsSummary
				| { summary: StatsSummary }
				| {
						totals: StatsSummary['totals']
						byCategory: StatsSummary['byCategory']
				  }
			>('/api/stats/summary')
			if ('summary' in response) {
				return response.summary
			}
			if ('totals' in response) {
				return { totals: response.totals, byCategory: response.byCategory }
			}
			return response
		},
	})
}

export function useFxRates() {
	return useQuery({
		queryKey: queryKeys.fxRates(),
		queryFn: async () => {
			const response = await fetchJson<FxRatesSnapshot>('/api/fx/rates')
			return response
		},
	})
}

export function useUpdateSettings() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async (payload: {
			primaryCurrency?: string
			timezone?: string
			pushEnabled?: boolean
		}) => {
			await fetchJson('/api/settings', { method: 'PUT', body: payload })
		},
		onSuccess: () => {
			client.invalidateQueries({ queryKey: queryKeys.me() })
			client.invalidateQueries({ queryKey: queryKeys.fxRates() })
		},
	})
}

export function useOnboardingTimezone() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async (timezone: string) => {
			await fetchJson('/api/onboarding/timezone', {
				method: 'POST',
				body: { timezone },
			})
		},
		onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.me() }),
	})
}

export function useOnboardingCurrency() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async (currency: string) => {
			await fetchJson('/api/onboarding/currency', {
				method: 'POST',
				body: { currency },
			})
		},
		onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.me() }),
	})
}

export function useOnboardingComplete() {
	const client = useQueryClient()
	return useMutation({
		mutationFn: async () => {
			await fetchJson('/api/onboarding/complete', { method: 'POST' })
		},
		onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.me() }),
	})
}

export function usePushSubscribe() {
	return useMutation({
		mutationFn: async (payload: { endpoint: string; p256dh: string; auth: string }) => {
			await fetchJson('/api/push/subscribe', {
				method: 'POST',
				body: payload,
			})
		},
	})
}

export function usePushUnsubscribe() {
	return useMutation({
		mutationFn: async (endpoint?: string) => {
			await fetchJson('/api/push/unsubscribe', {
				method: 'DELETE',
				body: endpoint ? { endpoint } : undefined,
			})
		},
	})
}

export function useSnoozeNotification() {
	return useMutation({
		mutationFn: async ({ subscriptionId, until }: { subscriptionId: string; until?: string }) => {
			await fetchJson(`/api/notifications/${subscriptionId}/snooze`, {
				method: 'POST',
				body: until ? { until } : undefined,
			})
		},
	})
}

export async function downloadSubscriptionsCsv(statuses: SubscriptionStatus[]) {
	const query = buildQuery({ statuses: statuses.join(',') })
	const response = await fetch(`/api/export/subscriptions.csv${query}`, {
		credentials: 'include',
	})
	if (!response.ok) {
		throw new Error('Failed to download CSV')
	}
	const blob = await response.blob()
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.download = 'subscriptions.csv'
	link.click()
	URL.revokeObjectURL(url)
}
