import { useId, useState } from 'react'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Subscription } from '@/lib/types'
import { useMarkPaid } from '@/lib/hooks'
import { useToast } from '@/components/toast'

export function MarkPaidDialog({ subscription }: { subscription: Subscription }) {
	const id = useId()
	const [amount, setAmount] = useState(subscription.amount_cents / 100)
	const [note, setNote] = useState('')
	const [nextRenewal, setNextRenewal] = useState('')
	const toast = useToast()
	const markPaid = useMarkPaid(subscription.id)

	const handleConfirm = async () => {
		try {
			let nextRenewalIso: string | undefined
			if (nextRenewal) {
				const parsed = new Date(nextRenewal)
				if (Number.isNaN(parsed.valueOf())) {
					toast.push({
						title: 'Invalid renewal date',
						description: 'Please select a valid date.',
					})
					return
				}
				nextRenewalIso = parsed.toISOString()
			}
			await markPaid.mutateAsync({
				amount_cents: Math.round(amount * 100),
				note: note || undefined,
				next_renewal_at: nextRenewalIso,
			})
			toast.push({
				title: 'Marked as paid',
				description: subscription.name,
			})
		} catch (error) {
			console.error(error)
			toast.push({
				title: 'Payment failed',
				description: 'Please try again.',
			})
		}
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button size="sm" variant="link" className="h-auto px-0">
					Mark paid
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Confirm payment</AlertDialogTitle>
				</AlertDialogHeader>
				<div className="space-y-3">
					<div>
						<label htmlFor={`${id}-amount`} className="text-xs text-muted-foreground">
							Amount
						</label>
						<Input
							id={`${id}-amount`}
							type="number"
							value={amount}
							onChange={(event) => setAmount(Number(event.target.value))}
							step="0.01"
							min="0"
						/>
					</div>
					<div>
						<label htmlFor={`${id}-next-renewal`} className="text-xs text-muted-foreground">
							Next renewal (optional)
						</label>
						<Input
							id={`${id}-next-renewal`}
							type="datetime-local"
							value={nextRenewal}
							onChange={(event) => setNextRenewal(event.target.value)}
						/>
					</div>
					<div>
						<label htmlFor={`${id}-note`} className="text-xs text-muted-foreground">
							Note
						</label>
						<Input
							id={`${id}-note`}
							value={note}
							onChange={(event) => setNote(event.target.value)}
						/>
					</div>
				</div>
				<div className="flex justify-end gap-2">
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={handleConfirm} disabled={markPaid.isPending}>
						Confirm
					</AlertDialogAction>
				</div>
			</AlertDialogContent>
		</AlertDialog>
	)
}
