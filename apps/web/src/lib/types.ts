export interface ApiErrorPayload {
	error: {
		code: string
		message: string
		details?: unknown
	}
}

export interface UserProfile {
	email: string
	name: string
	image?: string | null
	primaryCurrency?: string | null
	timezone?: string | null
	pushEnabled?: boolean
	onboardingDone: boolean
}

export interface SessionItem {
	id: string
	device_info?: string | null
	ip_address?: string | null
	created_at: string
	last_used: string
	expires_at: string
}

export type CadenceUnit = 'day' | 'week' | 'month' | 'year'
export type SubscriptionStatus = 'active' | 'paused' | 'archived'

export interface Subscription {
	id: string
	owner_email: string
	name: string
	merchant: string | null
	amount_cents: number
	currency: string
	cadence_unit: CadenceUnit
	cadence_count: number
	next_renewal_at: string
	status: SubscriptionStatus
	category_id: string | null
	notes: string | null
	created_at: string
	updated_at: string
	rate_at_creation: number | null
}

export interface SubscriptionEvent {
	id: string
	subscription_id: string
	owner_email: string
	type: 'payment' | 'skip'
	occurred_at: string
	amount_cents: number
	currency: string
	rate_at_event: number | null
	note: string | null
}

export interface Category {
	id: string
	owner_email: string
	name: string
	color: string | null
	is_default: number
	created_at: string
	subscription_count?: number
}

export interface StatsSummary {
	totals: {
		totalMonthlySpend: number
		totalYearlyProjection: number
		activeCount: number
		pausedCount: number
		monthOverMonthChange: number
	}
	byCategory: Array<{
		categoryId: string | null
		categoryName: string
		amount: number
		percentage: number
	}>
}

export interface FxRatesSnapshot {
	rates: Record<string, number>
	base: string
	fetchedAt: string
	isStale: boolean
}
