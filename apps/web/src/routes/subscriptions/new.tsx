import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useCategories, useCreateSubscription, useDuplicateCheck } from '@/lib/hooks'
import { fetchJson } from '@/lib/api'
import { useToast } from '@/components/toast'
import { useSubscriptionForm } from '@/lib/forms'
import { useAuthGuard } from '@/lib/guards'

const cadenceOptions = [
	{ label: 'Weekly', unit: 'week', count: 1 },
	{ label: 'Every 2 weeks', unit: 'week', count: 2 },
	{ label: 'Monthly', unit: 'month', count: 1 },
	{ label: 'Quarterly', unit: 'month', count: 3 },
	{ label: 'Every 6 months', unit: 'month', count: 6 },
	{ label: 'Yearly', unit: 'year', count: 1 },
]

export const Route = createFileRoute('/subscriptions/new')({
	component: NewSubscriptionPage,
})

function NewSubscriptionPage() {
	useAuthGuard({ requireOnboarding: true })
	const navigate = useNavigate()
	const toast = useToast()
	const form = useSubscriptionForm()
	const { data: categories } = useCategories()
	const [duplicateName, setDuplicateName] = useState('')
	const { data: duplicates } = useDuplicateCheck(duplicateName)
	const createSubscription = useCreateSubscription()
	const queryClient = useQueryClient()
	const [restoringId, setRestoringId] = useState<string | null>(null)
	const restoreSubscription = useMutation({
		mutationFn: async ({ id, next_renewal_at }: { id: string; next_renewal_at: string }) => {
			const response = await fetchJson<{ item: { id: string; name: string } }>(
				`/api/subscriptions/${id}/restore`,
				{ method: 'POST', body: { next_renewal_at } }
			)
			return response.item
		},
		onSuccess: (item) => {
			queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
			toast.push({ title: 'Subscription restored', description: item.name })
			navigate({ to: `/subscriptions/${item.id}` })
		},
		onSettled: () => setRestoringId(null),
	})

	const validateForm = () => {
		const values = form.state.values
		if (!values.name.trim()) {
			return 'Name is required.'
		}
		if (Number.isNaN(values.amount_cents) || values.amount_cents < 0) {
			return 'Amount must be zero or greater.'
		}
		const parsedDate = new Date(values.next_renewal_at)
		if (Number.isNaN(parsedDate.valueOf())) {
			return 'Next renewal date must be valid.'
		}
		return null
	}

	const handleSubmit = async () => {
		try {
			const errorMessage = validateForm()
			if (errorMessage) {
				toast.push({
					title: 'Check the form',
					description: errorMessage,
				})
				return
			}
			const values = form.state.values
			const payload = {
				...values,
				amount_cents: Math.round(values.amount_cents),
			}
			const result = await createSubscription.mutateAsync(payload)
			toast.push({ title: 'Subscription created', description: result.name })
			navigate({ to: `/subscriptions/${result.id}` })
		} catch (error) {
			console.error(error)
			toast.push({
				title: 'Failed to create',
				description: 'Please check the form and try again.',
			})
		}
	}

	return (
		<div className="mx-auto max-w-3xl space-y-6 px-4 sm:px-0">
			<div>
				<h1 className="text-2xl font-semibold">New subscription</h1>
				<p className="text-sm text-muted-foreground">Capture the cadence and next renewal date.</p>
			</div>
			<Card className="space-y-6 p-6">
				<div className="grid gap-4 md:grid-cols-2">
					<div>
						<label htmlFor="sub-name" className="text-xs text-muted-foreground">
							Name
						</label>
						<Input
							id="sub-name"
							value={form.state.values.name}
							onChange={(event) => {
								form.setFieldValue('name', event.target.value)
							}}
							onBlur={(event) => setDuplicateName(event.target.value)}
						/>
						{duplicates && duplicates.length > 0 && (
							<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
								<div className="font-semibold">Similar archived subscriptions found</div>
								<div className="mt-2 space-y-2">
									{duplicates.map((duplicate) => (
										<div key={duplicate.id} className="flex items-center justify-between gap-2">
											<div>
												<div className="text-sm font-medium">{duplicate.name}</div>
												<div className="text-[11px] text-amber-700/80">
													Archived · {duplicate.currency}{' '}
													{(duplicate.amount_cents / 100).toFixed(2)}
												</div>
											</div>
											<Button
												size="sm"
												variant="secondary"
												disabled={restoreSubscription.isPending && restoringId === duplicate.id}
												onClick={() => {
													setRestoringId(duplicate.id)
													restoreSubscription.mutate({
														id: duplicate.id,
														next_renewal_at: duplicate.next_renewal_at,
													})
												}}
											>
												{restoringId === duplicate.id ? 'Restoring…' : 'Restore'}
											</Button>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
					<div>
						<label htmlFor="sub-merchant" className="text-xs text-muted-foreground">
							Merchant
						</label>
						<Input
							id="sub-merchant"
							value={form.state.values.merchant}
							onChange={(event) => form.setFieldValue('merchant', event.target.value)}
						/>
					</div>
					<div>
						<label htmlFor="sub-amount" className="text-xs text-muted-foreground">
							Amount (cents)
						</label>
						<Input
							id="sub-amount"
							type="number"
							value={form.state.values.amount_cents}
							onChange={(event) => form.setFieldValue('amount_cents', Number(event.target.value))}
							min="0"
						/>
					</div>
					<div>
						<label htmlFor="sub-currency" className="text-xs text-muted-foreground">
							Currency
						</label>
						<Input
							id="sub-currency"
							value={form.state.values.currency}
							onChange={(event) => form.setFieldValue('currency', event.target.value.toUpperCase())}
							maxLength={3}
						/>
					</div>
					<div>
						<label htmlFor="sub-cadence" className="text-xs text-muted-foreground">
							Cadence
						</label>
						<Select
							value={`${form.state.values.cadence_unit}:${form.state.values.cadence_count}`}
							onValueChange={(value) => {
								const [unit, count] = value.split(':') as ['week' | 'month' | 'year', string]
								form.setFieldValue('cadence_unit', unit)
								form.setFieldValue('cadence_count', Number(count))
							}}
						>
							<SelectTrigger id="sub-cadence" className="w-full">
								<SelectValue placeholder="Select cadence" />
							</SelectTrigger>
							<SelectContent>
								{cadenceOptions.map((option) => (
									<SelectItem key={option.label} value={`${option.unit}:${option.count}`}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div>
						<label htmlFor="sub-renewal" className="text-xs text-muted-foreground">
							Next renewal
						</label>
						<Input
							id="sub-renewal"
							type="datetime-local"
							value={form.state.values.next_renewal_at.slice(0, 16)}
							onChange={(event) => {
								const value = event.target.value
								if (!value) {
									return
								}
								const parsed = new Date(value)
								if (Number.isNaN(parsed.valueOf())) {
									return
								}
								form.setFieldValue('next_renewal_at', parsed.toISOString())
							}}
						/>
					</div>
					<div>
						<label htmlFor="sub-category" className="text-xs text-muted-foreground">
							Category
						</label>
						<Select
							value={form.state.values.category_id ?? 'none'}
							onValueChange={(value) =>
								form.setFieldValue('category_id', value === 'none' ? null : value)
							}
						>
							<SelectTrigger id="sub-category" className="w-full">
								<SelectValue placeholder="Select category" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">Uncategorized</SelectItem>
								{categories?.map((category) => (
									<SelectItem key={category.id} value={category.id}>
										{category.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<div>
					<label htmlFor="sub-notes" className="text-xs text-muted-foreground">
						Notes
					</label>
					<Textarea
						id="sub-notes"
						value={form.state.values.notes}
						onChange={(event) => form.setFieldValue('notes', event.target.value)}
					/>
				</div>
				<div className="flex flex-wrap justify-end gap-2">
					<Button variant="secondary" onClick={() => navigate({ to: '/subscriptions' })}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={createSubscription.isPending}>
						Create subscription
					</Button>
				</div>
			</Card>
		</div>
	)
}
