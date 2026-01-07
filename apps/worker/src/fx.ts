import type { Kysely } from 'kysely'
import type { Database } from './db'
import type { Env } from './env'
import { AppError } from './errors'

export const FX_BASE = 'USD'
const FX_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface FxRatesSnapshot {
	base: string
	rates: Record<string, number>
	fetchedAt: string
	isStale: boolean
}

interface FxApiResponse {
	base?: string
	rates?: Record<string, unknown>
	timestamp?: number
}

function normalizeRates(rates: Record<string, unknown>, base: string) {
	const normalized: Record<string, number> = {}
	for (const [codeRaw, value] of Object.entries(rates)) {
		const code = codeRaw.toUpperCase()
		if (code.length !== 3) {
			continue
		}
		if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
			continue
		}
		normalized[code] = value
	}
	if (!normalized[base]) {
		normalized[base] = 1
	}
	return normalized
}

function isSnapshotFresh(fetchedAt: string, now: Date) {
	const timestamp = Date.parse(fetchedAt)
	if (!Number.isFinite(timestamp)) {
		return false
	}
	return now.getTime() - timestamp < FX_REFRESH_INTERVAL_MS
}

async function loadLatestSnapshot(
	db: Kysely<Database>,
	base: string
): Promise<FxRatesSnapshot | null> {
	const latest = await db
		.selectFrom('fx_rates')
		.select(['fetched_at'])
		.where('base', '=', base)
		.orderBy('fetched_at', 'desc')
		.executeTakeFirst()

	if (!latest?.fetched_at) {
		return null
	}

	const rows = await db
		.selectFrom('fx_rates')
		.select(['target', 'rate', 'is_stale'])
		.where('base', '=', base)
		.where('fetched_at', '=', latest.fetched_at)
		.execute()

	if (rows.length === 0) {
		return null
	}

	const rates: Record<string, number> = {}
	let isStale = false
	for (const row of rows) {
		rates[row.target] = row.rate
		if (row.is_stale === 1) {
			isStale = true
		}
	}

	return {
		base,
		rates,
		fetchedAt: latest.fetched_at,
		isStale,
	}
}

async function markSnapshotStale(db: Kysely<Database>, base: string, fetchedAt: string) {
	await db
		.updateTable('fx_rates')
		.set({ is_stale: 1 })
		.where('base', '=', base)
		.where('fetched_at', '=', fetchedAt)
		.execute()
}

async function insertFxRates(
	db: Kysely<Database>,
	snapshot: Omit<FxRatesSnapshot, 'isStale'>,
	isStale = false
) {
	const rows = Object.entries(snapshot.rates).map(([target, rate]) => ({
		id: crypto.randomUUID(),
		base: snapshot.base,
		target,
		rate,
		fetched_at: snapshot.fetchedAt,
		is_stale: isStale ? 1 : 0,
	}))

	if (rows.length === 0) {
		return
	}

	await db.insertInto('fx_rates').values(rows).execute()
}

async function fetchOpenExchangeRates(appId: string) {
	const url = new URL('https://openexchangerates.org/api/latest.json')
	url.searchParams.set('app_id', appId)

	const response = await fetch(url.toString())
	if (!response.ok) {
		throw new Error(`Open Exchange Rates request failed with status ${response.status}`)
	}

	const payload = (await response.json()) as FxApiResponse
	const base = (payload.base ?? FX_BASE).toUpperCase()
	if (base !== FX_BASE) {
		throw new Error('Open Exchange Rates returned unsupported base currency')
	}

	if (!payload.rates || typeof payload.rates !== 'object') {
		throw new Error('Open Exchange Rates response missing rates')
	}

	const rates = normalizeRates(payload.rates, base)
	if (Object.keys(rates).length === 0) {
		throw new Error('Open Exchange Rates response missing rates')
	}

	const fetchedAt = payload.timestamp
		? new Date(payload.timestamp * 1000).toISOString()
		: new Date().toISOString()

	return {
		base,
		rates,
		fetchedAt,
	}
}

export async function getFxRates(env: Env, db: Kysely<Database>): Promise<FxRatesSnapshot> {
	const cached = await loadLatestSnapshot(db, FX_BASE)
	const now = new Date()
	const isFresh = cached ? isSnapshotFresh(cached.fetchedAt, now) : false

	if (cached && isFresh) {
		return cached
	}

	const appId = env.OPEN_EXCHANGE_RATES_APP_ID
	if (!appId) {
		if (!cached) {
			throw new AppError(503, 'FX_UNAVAILABLE', 'FX rates unavailable')
		}
		if (!cached.isStale) {
			await markSnapshotStale(db, cached.base, cached.fetchedAt)
		}
		return { ...cached, isStale: true }
	}

	try {
		const fetched = await fetchOpenExchangeRates(appId)
		await insertFxRates(db, fetched, false)
		return { ...fetched, isStale: false }
	} catch (_error) {
		if (!cached) {
			throw new AppError(503, 'FX_UNAVAILABLE', 'FX rates unavailable')
		}
		if (!cached.isStale) {
			await markSnapshotStale(db, cached.base, cached.fetchedAt)
		}
		return { ...cached, isStale: true }
	}
}

export async function refreshFxRates(env: Env, db: Kysely<Database>) {
	const cached = await loadLatestSnapshot(db, FX_BASE)
	const now = new Date()
	const isFresh = cached ? isSnapshotFresh(cached.fetchedAt, now) : false

	if (cached && isFresh) {
		return cached
	}

	const appId = env.OPEN_EXCHANGE_RATES_APP_ID
	if (!appId) {
		if (cached && !cached.isStale) {
			await markSnapshotStale(db, cached.base, cached.fetchedAt)
		}
		return cached
	}

	try {
		const fetched = await fetchOpenExchangeRates(appId)
		await insertFxRates(db, fetched, false)
		return { ...fetched, isStale: false }
	} catch (_error) {
		if (cached && !cached.isStale) {
			await markSnapshotStale(db, cached.base, cached.fetchedAt)
		}
		return cached
	}
}
