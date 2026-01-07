import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/components/auth-context'
import { useOnboardingComplete, useOnboardingCurrency, useOnboardingTimezone } from '@/lib/hooks'
import { useToast } from '@/components/toast'
import { useOnboardingGuard } from '@/lib/guards'
import { queryKeys } from '@/lib/queryKeys'

const currencyOptions = [
	{ value: 'USD', label: 'USD — US Dollar' },
	{ value: 'EUR', label: 'EUR — Euro' },
	{ value: 'GBP', label: 'GBP — British Pound' },
	{ value: 'UAH', label: 'UAH — Ukrainian Hryvnia' },
	{ value: 'CAD', label: 'CAD — Canadian Dollar' },
	{ value: 'AUD', label: 'AUD — Australian Dollar' },
]

export const Route = createFileRoute('/onboarding')({
	component: OnboardingPage,
})

function OnboardingPage() {
	useOnboardingGuard()
	const navigate = useNavigate()
	const { user } = useAuth()
	const [step, setStep] = useState(0)
	const toast = useToast()
	const queryClient = useQueryClient()
	const timezoneMutation = useOnboardingTimezone()
	const currencyMutation = useOnboardingCurrency()
	const completeMutation = useOnboardingComplete()
	const detectedTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
	const [timezone, setTimezone] = useState(user?.timezone ?? detectedTimezone)
	const [currency, setCurrency] = useState(user?.primaryCurrency ?? 'USD')

	const handleTimezone = async () => {
		try {
			await timezoneMutation.mutateAsync(timezone)
			setStep(1)
		} catch (error) {
			console.error(error)
			toast.push({
				title: 'Could not save timezone',
				description: 'Please try again.',
			})
		}
	}

	const handleCurrency = async () => {
		try {
			await currencyMutation.mutateAsync(currency)
			setStep(2)
		} catch (error) {
			console.error(error)
			toast.push({
				title: 'Could not save currency',
				description: 'Please try again.',
			})
		}
	}

	const handleComplete = async (setReminder?: boolean) => {
		try {
			await completeMutation.mutateAsync()
			if (setReminder && typeof window !== 'undefined') {
				window.localStorage.setItem('onboardingSkipReminder', '1')
				window.sessionStorage.setItem('onboardingSkipReminderSuppress', '1')
			}
			if (user) {
				queryClient.setQueryData(queryKeys.me(), {
					...user,
					onboardingDone: true,
				})
			}
			navigate({ to: '/dashboard' })
		} catch (error) {
			console.error(error)
			toast.push({
				title: 'Onboarding incomplete',
				description: 'Please try again.',
			})
		}
	}

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
			<div>
				<h1 className="text-2xl font-semibold">Welcome to subsctl</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Let’s set up your timezone and primary currency.
				</p>
			</div>
			<Card className="border-border/60 p-6">
				{step === 0 && (
					<div className="space-y-5">
						<div>
							<div className="text-sm font-semibold">Confirm timezone</div>
							<p className="text-xs text-muted-foreground">
								We detected {detectedTimezone}. You can adjust it below.
							</p>
						</div>
						<Input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
						<Button onClick={handleTimezone} disabled={timezoneMutation.isPending}>
							Continue
						</Button>
					</div>
				)}
				{step === 1 && (
					<div className="space-y-5">
						<div>
							<div className="text-sm font-semibold">Primary currency</div>
							<p className="text-xs text-muted-foreground">
								All totals will convert to this currency.
							</p>
						</div>
						<Select value={currency} onValueChange={setCurrency}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select currency" />
							</SelectTrigger>
							<SelectContent>
								{currencyOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button onClick={handleCurrency} disabled={currencyMutation.isPending}>
							Continue
						</Button>
					</div>
				)}
				{step === 2 && (
					<div className="space-y-4">
						<div className="text-sm font-semibold">You’re ready</div>
						<p className="text-xs text-muted-foreground">
							You can add your first subscription now or skip and do it later.
						</p>
						<div className="flex flex-wrap gap-2">
							<Button
								onClick={async () => {
									try {
										await completeMutation.mutateAsync()
										if (user) {
											queryClient.setQueryData(queryKeys.me(), {
												...user,
												onboardingDone: true,
											})
										}
										navigate({ to: '/subscriptions/new' })
									} catch (error) {
										console.error(error)
										toast.push({
											title: 'Onboarding incomplete',
											description: 'Please try again.',
										})
									}
								}}
							>
								Add subscription
							</Button>
							<Button variant="secondary" onClick={() => handleComplete(true)}>
								Skip for now
							</Button>
						</div>
					</div>
				)}
			</Card>
		</div>
	)
}
