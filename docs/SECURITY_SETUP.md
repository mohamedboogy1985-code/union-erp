# Security Setup Guide

## Server Security Configuration

This guide explains the security improvements made to the Union ERP API server.

## Request Size Limits

The API now uses reasonable request size limits to prevent DoS attacks:

```typescript
// JSON payload limit: 50MB (was 250MB)
app.use(express.json({ limit: '50mb' }));

// URL-encoded form data limit: 50MB
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

**Why this change?**
- 250MB limit is excessive and creates DoS vulnerability
- 50MB balances legitimate data imports with security
- Typical employee datasets: 1-10MB
- Financial reports: 5-20MB

## Rate Limiting

### General API Rate Limit
```typescript
// 100 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
```

### Authentication Rate Limit
```typescript
// 5 login attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // Successful logins don't count
});
```

### Upload Rate Limit
```typescript
// 50 uploads per hour per IP
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
});
```

## Implementation

### In Your Server File

```typescript
import express from 'express';
import {
  applySecurityMiddleware,
  applyAuthRateLimiting,
  applyUploadRateLimiting,
} from './middleware/security';

const app = express();

// Apply general security middleware
applySecurityMiddleware(app);

// Apply specific rate limiters
applyAuthRateLimiting(app, '/api/auth/login');
applyUploadRateLimiting(app, '/api/uploads');

// Your routes...
app.use('/api', routes);
```

## Security Headers

The middleware uses `helmet` to set security headers:

```
Content-Security-Policy: default-src 'self'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Environment Variables

For development, you might want to adjust limits:

```bash
# .env file
RATE_LIMIT_WINDOW_MS=900000      # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100      # Per window
AUTH_RATE_LIMIT_MAX=5            # Login attempts
UPLOAD_RATE_LIMIT_MAX=50         # Per hour
JSON_PAYLOAD_LIMIT=50mb          # Max JSON size
```

## Testing Rate Limits

```bash
# Test rate limiting (should see 429 after limit)
for i in {1..20}; do
  curl -X GET http://localhost:3000/api/status
  echo "Request $i"
done

# Check rate limit headers
curl -i http://localhost:3000/api/status
# Look for: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
```

## Handling Rate Limit Errors

When rate limit is exceeded, users receive:

```json
{
  "status": 429,
  "message": "Too many requests from this IP, please try again later.",
  "retryAfter": 60
}
```

## Monitoring

Monitor rate limit violations in logs:

```bash
# Find rate limit errors
grep "Too many requests" server.log

# Check IP addresses being rate limited
grep -oP '(?<=from )[^,]+' server.log | sort | uniq -c
```

## Database Connection Security

Ensure `DATABASE_URL` is set securely:

```bash
# Production (use environment variable, not .env)
export DATABASE_URL="postgresql://user:password@secure-host:5432/db"

# Development only
echo "DATABASE_URL=postgresql://user:pass@localhost:5432/dev_db" >> .env.local
```

## Prisma Configuration Security

The updated `prisma.config.ts` provides:

```typescript
// Type-safe configuration
import type { PrismaConfig } from '@prisma/orm-postgres/config';

// Safe environment variable access with fallback
connection: process.env.DATABASE_URL || '',
```

## Code Quality Security

The stricter ESLint configuration catches:

- ❌ Unused variables (memory leaks)
- ❌ Implicit `any` types (type confusion)
- ❌ Non-null assertions without validation
- ❌ Floating promises (unhandled rejections)
- ❌ Misused promises in conditions

## Migration Checklist

- [ ] Update rate limit constants if needed
- [ ] Test with Postman/curl to verify limits
- [ ] Update monitoring/alerting for rate limit violations
- [ ] Document for team on new rate limiting behavior
- [ ] Update API clients if they might hit limits
- [ ] Monitor logs for first week after deployment
- [ ] Adjust limits based on real-world usage patterns

## Support

For questions or issues:
1. Check `docs/API_CONFIGURATION.md` for API endpoints
2. Review `IMPROVEMENTS.md` for overview of changes
3. Check `src/middleware/security.ts` for implementation details
