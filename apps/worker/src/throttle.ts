type Bucket = {
	count: number
	resetAt: number
}

const buckets = new Map<string, Bucket>()

export function consumeRateLimit(key: string, limit: number, windowMs: number) {
	const now = Date.now()
	const bucket = buckets.get(key)
	if (!bucket || now > bucket.resetAt) {
		buckets.set(key, { count: 1, resetAt: now + windowMs })
		return true
	}
	if (bucket.count >= limit) {
		return false
	}
	bucket.count += 1
	return true
}
