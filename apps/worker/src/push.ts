import type { Kysely } from 'kysely'
import type { Database } from './db'
import type { Env } from './env'

const DAY_MS = 24 * 60 * 60 * 1000

function base64UrlEncode(input: Uint8Array) {
	let str = ''
	for (const byte of input) {
		str += String.fromCharCode(byte)
	}
	const base64 = btoa(str)
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(input: string) {
	const padded = input
		.replace(/-/g, '+')
		.replace(/_/g, '/')
		.padEnd(Math.ceil(input.length / 4) * 4, '=')
	const raw = atob(padded)
	const bytes = new Uint8Array(raw.length)
	for (let i = 0; i < raw.length; i += 1) {
		bytes[i] = raw.charCodeAt(i)
	}
	return bytes
}

async function importVapidKey(publicKey: string, privateKey: string) {
	const publicBytes = base64UrlDecode(publicKey)
	if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
		throw new Error('Invalid VAPID public key')
	}
	const x = base64UrlEncode(publicBytes.slice(1, 33))
	const y = base64UrlEncode(publicBytes.slice(33))
	const d = base64UrlEncode(base64UrlDecode(privateKey))

	const jwk: JsonWebKey = {
		kty: 'EC',
		crv: 'P-256',
		x,
		y,
		d,
	}

	return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
		'sign',
	])
}

async function createVapidJwt(endpoint: string, env: Env, expirationSeconds = 12 * 60 * 60) {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
		throw new Error('Missing VAPID keys')
	}
	const url = new URL(endpoint)
	const header = {
		alg: 'ES256',
		typ: 'JWT',
	}
	const payload = {
		aud: url.origin,
		exp: Math.floor(Date.now() / 1000) + expirationSeconds,
		sub: env.BETTER_AUTH_URL,
	}
	const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)))
	const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)))
	const data = `${encodedHeader}.${encodedPayload}`
	const key = await importVapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
	const signature = new Uint8Array(
		await crypto.subtle.sign(
			{ name: 'ECDSA', hash: 'SHA-256' },
			key,
			new TextEncoder().encode(data)
		)
	)
	return `${data}.${base64UrlEncode(signature)}`
}

export async function sendWebPush(endpoint: string, env: Env, options?: { ttl?: number }) {
	const jwt = await createVapidJwt(endpoint, env)
	const ttl = options?.ttl ?? 60 * 60 * 24
	const headers = new Headers({
		TTL: String(ttl),
		Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
		'Crypto-Key': `p256ecdsa=${env.VAPID_PUBLIC_KEY}`,
	})

	return fetch(endpoint, {
		method: 'POST',
		headers,
	})
}

function getUtcDayFromZone(date: Date, timeZone: string) {
	try {
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		})
		const parts = formatter.formatToParts(date)
		const year = Number(parts.find((part) => part.type === 'year')?.value)
		const month = Number(parts.find((part) => part.type === 'month')?.value)
		const day = Number(parts.find((part) => part.type === 'day')?.value)
		if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
			return null
		}
		return new Date(Date.UTC(year, month - 1, day))
	} catch {
		return null
	}
}

export async function sendRenewalNotifications(env: Env, db: Kysely<Database>) {
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
		return
	}

	const now = new Date()
	const start = new Date(now.getTime() + 2 * DAY_MS)
	const end = new Date(now.getTime() + 4 * DAY_MS)
	const nowIso = now.toISOString()

	const candidates = await db
		.selectFrom('subscriptions')
		.innerJoin('users', 'users.email', 'subscriptions.owner_email')
		.select([
			'subscriptions.id as subscription_id',
			'subscriptions.name as name',
			'subscriptions.next_renewal_at as next_renewal_at',
			'users.id as user_id',
			'users.timezone as timezone',
			'users.push_enabled as push_enabled',
		])
		.where('subscriptions.status', '=', 'active')
		.where('subscriptions.next_renewal_at', '>=', start.toISOString())
		.where('subscriptions.next_renewal_at', '<=', end.toISOString())
		.execute()

	for (const candidate of candidates) {
		if (candidate.push_enabled !== 1) {
			continue
		}
		if (!candidate.timezone) {
			continue
		}
		const renewalDate = new Date(candidate.next_renewal_at)
		const todayLocal = getUtcDayFromZone(now, candidate.timezone)
		const renewalLocal = getUtcDayFromZone(renewalDate, candidate.timezone)
		if (!todayLocal || !renewalLocal) {
			continue
		}
		const diffDays = Math.round((renewalLocal.getTime() - todayLocal.getTime()) / DAY_MS)
		if (diffDays !== 3) {
			continue
		}

		const snooze = await db
			.selectFrom('notification_snoozes')
			.select(['id'])
			.where('subscription_id', '=', candidate.subscription_id)
			.where('user_id', '=', candidate.user_id)
			.where('snoozed_until', '>=', nowIso)
			.executeTakeFirst()

		if (snooze) {
			continue
		}

		const pushSubscriptions = await db
			.selectFrom('push_subscriptions')
			.selectAll()
			.where('user_id', '=', candidate.user_id)
			.execute()

		for (const subscription of pushSubscriptions) {
			try {
				const response = await sendWebPush(subscription.endpoint, env)
				if (response.status === 404 || response.status === 410) {
					await db.deleteFrom('push_subscriptions').where('id', '=', subscription.id).execute()
				}
			} catch (error) {
				console.error('Failed to send push notification', {
					subscriptionId: candidate.subscription_id,
					error,
				})
			}
		}
	}
}
