import { useForm } from '@tanstack/react-form'
import type { Category, Subscription } from './types'

export function useSubscriptionForm(defaults?: Partial<Subscription>) {
	return useForm({
		defaultValues: {
			name: defaults?.name ?? '',
			merchant: defaults?.merchant ?? '',
			amount_cents: defaults?.amount_cents ?? 0,
			currency: defaults?.currency ?? 'USD',
			cadence_unit: defaults?.cadence_unit ?? 'month',
			cadence_count: defaults?.cadence_count ?? 1,
			next_renewal_at: defaults?.next_renewal_at ?? new Date().toISOString(),
			category_id: defaults?.category_id ?? null,
			notes: defaults?.notes ?? '',
		},
		onSubmit: async () => {},
	})
}

export function useCategoryForm(defaults?: Partial<Category>) {
	return useForm({
		defaultValues: {
			name: defaults?.name ?? '',
			color: defaults?.color ?? '',
		},
		onSubmit: async () => {},
	})
}
