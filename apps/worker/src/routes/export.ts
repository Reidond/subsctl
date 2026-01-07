import { Elysia, t } from 'elysia'
import type { Env } from '../env'
import { ensureAppUser, getDb, getRateToPrimary, type SubscriptionStatus } from '../db'
import { authPlugin } from '../auth-plugin'

function csvEscape(value: string) {
	const needsQuotes = /[",\n\r]/.test(value)
	if (!needsQuotes) {
		return value
	}
	return `"${value.replace(/"/g, '""')}"`
}

function formatCsvRow(values: Array<string | number | null>) {
	return values
		.map((value) => {
			if (value === null || value === undefined) {
				return ''
			}
			return csvEscape(String(value))
		})
		.join(',')
}

function getPreferredLocale(header?: string | null) {
	if (!header) {
		return 'en-US'
	}
	const [first] = header.split(',')
	if (!first) {
		return 'en-US'
	}
	const locale = first.split(';')[0]?.trim()
	return locale || 'en-US'
}

function createDateFormatter(locale: string, timeZone?: string | null) {
	try {
		return new Intl.DateTimeFormat(locale, {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: timeZone ?? undefined,
		})
	} catch {
		return new Intl.DateTimeFormat('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short',
		})
	}
}

function formatDate(value: string | null | undefined, formatter: Intl.DateTimeFormat) {
	if (!value) {
		return ''
	}
	const date = new Date(value)
	if (Number.isNaN(date.valueOf())) {
		return value
	}
	return formatter.format(date)
}

export function exportRoutes(env: Env) {
	const db = getDb(env)

	return new Elysia({ prefix: '/api/export' }).use(authPlugin(env)).get(
		'/subscriptions.csv',
		async ({ user, query, set, request }) => {
			const email = user.email as string
			const authUser = user as {
				id: string
				email: string
				name?: string | null
				image?: string | null
			}
			const settings = await ensureAppUser(db, authUser)
			const primaryCurrency = settings.primary_currency ?? null
			const locale = getPreferredLocale(request.headers.get('accept-language'))
			const formatter = createDateFormatter(locale, settings.timezone ?? null)

			const rawStatuses = (query.statuses ?? '')
				.split(',')
				.map((status) => status.trim())
				.filter(Boolean)
			const allowedStatuses = new Set<SubscriptionStatus>(['active', 'paused', 'archived'])
			const statuses = rawStatuses.filter((status): status is SubscriptionStatus =>
				allowedStatuses.has(status as SubscriptionStatus)
			)

			let builder = db
				.selectFrom('subscriptions')
				.leftJoin('categories', 'categories.id', 'subscriptions.category_id')
				.select([
					'subscriptions.id as id',
					'subscriptions.name as name',
					'subscriptions.merchant as merchant',
					'subscriptions.amount_cents as amount_cents',
					'subscriptions.currency as currency',
					'subscriptions.cadence_unit as cadence_unit',
					'subscriptions.cadence_count as cadence_count',
					'subscriptions.next_renewal_at as next_renewal_at',
					'subscriptions.status as status',
					'subscriptions.notes as notes',
					'subscriptions.created_at as created_at',
					'subscriptions.updated_at as updated_at',
					'categories.name as category_name',
				])
				.where('subscriptions.owner_email', '=', email)

			if (statuses.length > 0) {
				builder = builder.where('subscriptions.status', 'in', statuses)
			}

			const items = await builder.orderBy('subscriptions.created_at').execute()
			const header = formatCsvRow([
				'id',
				'name',
				'merchant',
				'amount_cents',
				'currency',
				'amount_primary',
				'primary_currency',
				'cadence_unit',
				'cadence_count',
				'next_renewal_at',
				'status',
				'category',
				'notes',
				'created_at',
				'updated_at',
			])

			const rows: string[] = [header]
			for (const item of items) {
				const rate =
					(await getRateToPrimary(db, primaryCurrency, item.currency)) ??
					(primaryCurrency && item.currency === primaryCurrency ? 1 : null)
				const amountPrimary = rate === null ? null : Math.round(item.amount_cents * rate) / 100
				rows.push(
					formatCsvRow([
						item.id,
						item.name,
						item.merchant ?? '',
						item.amount_cents,
						item.currency,
						amountPrimary,
						primaryCurrency,
						item.cadence_unit,
						item.cadence_count,
						formatDate(item.next_renewal_at, formatter),
						item.status,
						item.category_name ?? 'Uncategorized',
						item.notes ?? '',
						formatDate(item.created_at, formatter),
						formatDate(item.updated_at, formatter),
					])
				)
			}

			set.headers['content-type'] = 'text/csv; charset=utf-8'
			set.headers['content-disposition'] = 'attachment; filename="subscriptions.csv"'
			return rows.join('\n')
		},
		{
			auth: true,
			query: t.Object({
				statuses: t.Optional(t.String()),
			}),
		}
	)
}
