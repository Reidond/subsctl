export const queryKeys = {
	me: () => ['me'] as const,
	subscriptions: (params: { status?: string; q?: string; from?: string; to?: string }) =>
		['subscriptions', params] as const,
	subscription: (id: string) => ['subscription', id] as const,
	subscriptionEvents: (id: string) => ['subscription-events', id] as const,
	categories: () => ['categories'] as const,
	stats: () => ['stats'] as const,
	sessions: () => ['sessions'] as const,
	fxRates: () => ['fx-rates'] as const,
}
