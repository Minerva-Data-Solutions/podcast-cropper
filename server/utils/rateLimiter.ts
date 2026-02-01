interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean up every minute

if (typeof process !== 'undefined') {
  process.on('exit', () => {
    clearInterval(cleanupInterval)
  })
}

export const checkRateLimit = (
  identifier: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } => {
  const now = Date.now()
  const entry = rateLimitStore.get(identifier)
  
  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs
    })
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs
    }
  }
  
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetTime
    }
  }
  
  entry.count++
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetTime
  }
}

export const getClientIdentifier = (event: any): string => {
  try {
    // Use Nuxt's getClientIP helper if available
    const ip = event.node?.req?.connection?.remoteAddress || event.node?.req?.socket?.remoteAddress
    if (ip) {
      return ip
    }
    
    // Fallback to manual extraction
    const forwarded = event.node?.req?.headers?.['x-forwarded-for']
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded
      return ip.split(',')[0].trim()
    }
    
    return event.node?.req?.socket?.remoteAddress || 'unknown'
  } catch {
    return 'unknown'
  }
}