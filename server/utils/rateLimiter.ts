let requestCount = 0
let resetTime = Date.now() + 3600000 // 1 hour from now

export const checkGlobalRateLimit = (
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } => {
  const now = Date.now()
  
  // Reset if window has expired
  if (now >= resetTime) {
    requestCount = 0
    resetTime = now + windowMs
  }
  
  // Check if limit exceeded
  if (requestCount >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: resetTime
    }
  }
  
  // Increment counter
  requestCount++
  
  return {
    allowed: true,
    remaining: maxRequests - requestCount,
    resetAt: resetTime
  }
}