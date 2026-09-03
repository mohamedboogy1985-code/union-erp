# API Configuration Guide

## Overview

This document describes the configuration and security settings for the Union ERP API server.

## Request Size Limits

The API uses the following request size limits to prevent DoS attacks and resource exhaustion:

```typescript
// JSON payload limit
app.use(express.json({ limit: '50mb' }));

// URL-encoded form data limit
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

**Why 50mb?**
- Allows legitimate large data imports (e.g., employee records, financial data)
- Prevents abuse from extremely large payloads (250mb+ is excessive)
- Balances between functionality and security

## Rate Limiting

Rate limiting is implemented to protect the API from abuse:

```typescript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api/', limiter);
```

## New API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh authentication token

### Portal Management
- `GET /api/portals` - List all portals (syndicate, training, committees)
- `POST /api/portals` - Create new portal
- `GET /api/portals/:id` - Get portal details
- `PUT /api/portals/:id` - Update portal
- `DELETE /api/portals/:id` - Delete portal

### Ledger Management
- `POST /api/ledger/entries` - Create journal entry
- `GET /api/ledger/entries` - List entries with chain verification
- `POST /api/ledger/verify-chain` - Verify ledger chain integrity
- `POST /api/ledger/rebuild-chain` - Rebuild corrupted ledger chain

### Reporting
- `GET /api/reports/financial` - Generate financial reports
- `POST /api/reports/export` - Export reports to Excel/PDF
- `GET /api/reports/ai-insights` - Get AI-generated insights

### Organization Management
- `POST /api/orgs` - Create organization
- `GET /api/orgs/:id/members` - List organization members
- `POST /api/orgs/:id/members` - Add member to organization

## Database Connection

The API connects to PostgreSQL using environment variable:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/union_erp
```

## CORS Configuration

CORS is configured for cross-origin requests:

```typescript
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
```

## Error Handling

All endpoints follow consistent error handling:

```typescript
// Success response
{
  success: true,
  data: { /* response data */ }
}

// Error response
{
  success: false,
  error: {
    code: 'ERROR_CODE',
    message: 'Human readable message',
    details: { /* optional */ }
  }
}
```

## Security Headers

The API sets security headers using `helmet`:

```typescript
app.use(helmet());
```

This includes:
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security (HSTS)

## Testing the API

Use the provided Postman collection or curl:

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Get portals
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/portals
```
