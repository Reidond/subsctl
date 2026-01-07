import { Elysia } from 'elysia'
import type { Env } from '../env'
import {
	countSubscriptionsByStatus,
	ensureAppUser,
	getDb,
	getRateToPrimary,
	monthlyFactor,
} from '../db'
import { authPlugin } from '../auth-plugin'

export function statsRoutes(env: Env) {
	const db = getDb(env)

	return new Elysia({ prefix: '/api' }).use(authPlugin(env)).get(
		'/stats/summary',
		async ({ user }) => {
			const email = user.email as string
			const authUser = user as {
				id: string
				email: string
				name?: string | null
				image?: string | null
			}
			const settings = await ensureAppUser(db, authUser)

			const primaryCurrency = settings.primary_currency ?? null
			const subscriptions = await db
				.selectFrom('subscriptions')
				.selectAll()
				.where('owner_email', '=', email)
				.where('status', '=', 'active')
				.execute()

			const categories = await db
				.selectFrom('categories')
				.select(['id', 'name'])
				.where('owner_email', '=', email)
				.execute()
			const categoryNames = new Map(categories.map((category) => [category.id, category.name]))

			let totalMonthlyCents = 0
			let totalYearlyCents = 0
			const byCategory = new Map<string, number>()

			for (const subscription of subscriptions) {
				const fallbackRate = primaryCurrency
					? subscription.currency === primaryCurrency
						? 1
						: 0
					: 1
				const rate =
					(await getRateToPrimary(db, primaryCurrency, subscription.currency)) ??
					subscription.rate_at_creation ??
					fallbackRate

				const amountCents = Math.round(subscription.amount_cents * rate)
				const factor = monthlyFactor(subscription.cadence_unit, subscription.cadence_count)
				const monthly = amountCents * factor
				const yearly = monthly * 12

				totalMonthlyCents += monthly
				totalYearlyCents += yearly
				const key = subscription.category_id ?? 'uncategorized'
				byCategory.set(key, (byCategory.get(key) ?? 0) + monthly)
			}

			const activeCount = subscriptions.length
			const pausedCount = await countSubscriptionsByStatus(db, email, 'paused')

			const now = new Date()
			const start30 = new Date(now.getTime())
			start30.setUTCDate(start30.getUTCDate() - 30)
			const start60 = new Date(now.getTime())
			start60.setUTCDate(start60.getUTCDate() - 60)
			const start30Iso = start30.toISOString()
			const start60Iso = start60.toISOString()

			const events = await db
				.selectFrom('subscription_events')
				.select(['amount_cents', 'currency', 'rate_at_event', 'occurred_at'])
				.where('owner_email', '=', email)
				.where('occurred_at', '>=', start60Iso)
				.execute()

			const fallbackRates = new Map<string, number>()
			if (primaryCurrency) {
				const missing = new Set<string>()
				for (const event of events) {
					if (event.rate_at_event == null && event.currency !== primaryCurrency) {
						missing.add(event.currency)
					}
				}
				for (const currency of missing) {
					const rate = await getRateToPrimary(db, primaryCurrency, currency)
					fallbackRates.set(currency, rate ?? 0)
				}
			}

			let lastMonthCents = 0
			let prevMonthCents = 0
			for (const event of events) {
				const rate =
					event.rate_at_event ??
					(primaryCurrency
						? event.currency === primaryCurrency
							? 1
							: (fallbackRates.get(event.currency) ?? 0)
						: 1)
				const amount = Math.round(event.amount_cents * rate)
				if (event.occurred_at >= start30Iso) {
					lastMonthCents += amount
				} else {
					prevMonthCents += amount
				}
			}
			const monthOverMonthChange =
				prevMonthCents > 0 ? ((lastMonthCents - prevMonthCents) / prevMonthCents) * 100 : 0

			const totals = {
				totalMonthlySpend: totalMonthlyCents / 100,
				totalYearlyProjection: totalYearlyCents / 100,
				activeCount,
				pausedCount,
				monthOverMonthChange,
			}

			const categoryItems = Array.from(byCategory.entries()).map(([categoryId, amount]) => {
				const name =
					categoryId === 'uncategorized'
						? 'Uncategorized'
						: (categoryNames.get(categoryId) ?? 'Unknown')
				const percentage = totalMonthlyCents ? (amount / totalMonthlyCents) * 100 : 0
				return {
					categoryId: categoryId === 'uncategorized' ? null : categoryId,
					categoryName: name,
					amount: amount / 100,
					percentage,
				}
			})

			return { totals, byCategory: categoryItems }
		},
		{ auth: true }
	)
}
