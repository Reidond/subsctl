import { D1Dialect } from 'kysely-d1'
import { Kysely } from 'kysely'
import type { Env } from './env'

export type CadenceUnit = 'day' | 'week' | 'month' | 'year'
export type SubscriptionStatus = 'active' | 'paused' | 'archived'

export interface UsersTable {
	id: string
	email: string
	name: string
	image: string | null
	primary_currency: string | null
	timezone: string | null
	push_enabled: number
	onboarding_done: number
	created_at: string
	updated_at: string
}

export interface CategoriesTable {
	id: string
	owner_email: string
	name: string
	color: string | null
	is_default: number
	created_at: string
}

export interface SubscriptionsTable {
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

export interface SubscriptionEventsTable {
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

export interface FxRatesTable {
	id: string
	base: string
	target: string
	rate: number
	fetched_at: string
	is_stale: number
}

export interface PushSubscriptionsTable {
	id: string
	user_id: string
	endpoint: string
	p256dh: string
	auth: string
	created_at: string
}

export interface NotificationSnoozesTable {
	id: string
	subscription_id: string
	user_id: string
	snoozed_until: string
	created_at: string
}

export interface AuthSessionTable {
	id: string
	userId: string
	token: string
	expiresAt: string
	ipAddress: string | null
	userAgent: string | null
	createdAt: string
	updatedAt: string
}

export interface Database {
	users: UsersTable
	categories: CategoriesTable
	subscriptions: SubscriptionsTable
	subscription_events: SubscriptionEventsTable
	fx_rates: FxRatesTable
	push_subscriptions: PushSubscriptionsTable
	notification_snoozes: NotificationSnoozesTable
	// Better Auth core tables used for sessions management
	session: AuthSessionTable
}

let cachedDb: Kysely<Database> | null = null

export function getDb(env: Env) {
	if (!cachedDb) {
		cachedDb = new Kysely<Database>({
			dialect: new D1Dialect({ database: env.DB }),
		})
	}
	return cachedDb
}

export function nowIso() {
	return new Date().toISOString()
}

export async function ensureAppUser(
	db: Kysely<Database>,
	authUser: { id: string; email: string; name?: string | null; image?: string | null }
) {
	const existing = await db
		.selectFrom('users')
		.selectAll()
		.where('id', '=', authUser.id)
		.executeTakeFirst()

	const displayName = authUser.name ?? authUser.email
	const image = authUser.image ?? null
	const timestamp = nowIso()

	if (!existing) {
		const record: UsersTable = {
			id: authUser.id,
			email: authUser.email,
			name: displayName,
			image,
			primary_currency: null,
			timezone: null,
			push_enabled: 0,
			onboarding_done: 0,
			created_at: timestamp,
			updated_at: timestamp,
		}
		await db.insertInto('users').values(record).execute()
		return record
	}

	if (
		existing.email !== authUser.email ||
		existing.name !== displayName ||
		existing.image !== image
	) {
		await db
			.updateTable('users')
			.set({
				email: authUser.email,
				name: displayName,
				image,
				updated_at: timestamp,
			})
			.where('id', '=', authUser.id)
			.execute()
		return {
			...existing,
			email: authUser.email,
			name: displayName,
			image,
			updated_at: timestamp,
		}
	}

	return existing
}

export async function ensureDefaultCategory(db: Kysely<Database>, ownerEmail: string) {
	const existing = await db
		.selectFrom('categories')
		.selectAll()
		.where('owner_email', '=', ownerEmail)
		.where('is_default', '=', 1)
		.executeTakeFirst()

	if (existing) {
		return existing
	}

	const timestamp = nowIso()
	const record: CategoriesTable = {
		id: crypto.randomUUID(),
		owner_email: ownerEmail,
		name: 'Default',
		color: null,
		is_default: 1,
		created_at: timestamp,
	}
	await db.insertInto('categories').values(record).execute()
	return record
}

export async function getRateToPrimary(
	db: Kysely<Database>,
	primaryCurrency: string | null,
	fromCurrency: string
) {
	if (!primaryCurrency) {
		return null
	}

	if (primaryCurrency === fromCurrency) {
		return 1
	}

	const [toPrimary, fromBase] = await Promise.all([
		db
			.selectFrom('fx_rates')
			.select(['rate'])
			.where('base', '=', 'USD')
			.where('target', '=', primaryCurrency)
			.orderBy('fetched_at', 'desc')
			.executeTakeFirst(),
		db
			.selectFrom('fx_rates')
			.select(['rate'])
			.where('base', '=', 'USD')
			.where('target', '=', fromCurrency)
			.orderBy('fetched_at', 'desc')
			.executeTakeFirst(),
	])

	if (!toPrimary || !fromBase) {
		return null
	}

	if (fromBase.rate === 0) {
		return null
	}

	return toPrimary.rate / fromBase.rate
}

export const MONTHLY_DAYS = 365.25 / 12
export const WEEKS_PER_MONTH = MONTHLY_DAYS / 7

export function monthlyFactor(unit: CadenceUnit, count: number) {
	if (count <= 0) {
		return 0
	}

	switch (unit) {
		case 'day':
			return MONTHLY_DAYS / count
		case 'week':
			return WEEKS_PER_MONTH / count
		case 'month':
			return 1 / count
		case 'year':
			return 12 / count
		default:
			return 0
	}
}

export function addCadence(date: Date, unit: CadenceUnit, count: number): Date {
	const next = new Date(date.getTime())
	if (unit === 'day') {
		next.setUTCDate(next.getUTCDate() + count)
		return next
	}
	if (unit === 'week') {
		next.setUTCDate(next.getUTCDate() + count * 7)
		return next
	}
	if (unit === 'month') {
		next.setUTCMonth(next.getUTCMonth() + count)
		return next
	}

	next.setUTCFullYear(next.getUTCFullYear() + count)
	return next
}

export function advanceRenewal(start: Date, unit: CadenceUnit, count: number, now: Date): Date {
	let cursor = new Date(start.getTime())
	for (let i = 0; i < 10000; i += 1) {
		if (cursor.getTime() > now.getTime()) {
			break
		}
		cursor = addCadence(cursor, unit, count)
	}
	return cursor
}

export function toNumber(value: unknown) {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function countSubscriptionsByStatus(
	db: Kysely<Database>,
	email: string,
	status: SubscriptionStatus
) {
	const result = await db
		.selectFrom('subscriptions')
		.select((eb) => eb.fn.countAll<number>().as('count'))
		.where('owner_email', '=', email)
		.where('status', '=', status)
		.executeTakeFirst()

	return result?.count ?? 0
}
