# Integration and Deployment Guide

## Quick Start

### 1. File Structure

Copy the new files to your project:

```
backend/src/
├── controllers/
│   └── RefundController.js          (NEW)
├── services/
│   └── RefundService.js             (NEW)
├── repository/
│   └── RefundRepository.js          (NEW)
├── __tests__/
│   └── refund.test.js               (NEW)
├── api/
│   ├── refundController.js          (OLD - can delete after migration)
│   └── refundController.example.js  (NEW - integration guide)
├── config/
│   ├── db.js                        (existing)
│   └── queue.js                     (existing)
└── server.js                        (needs update)
```

### 2. Database Schema Update

Run these migrations to support idempotency and timestamps:

```sql
-- Add columns if they don't exist
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create index for idempotency lookups
CREATE INDEX IF NOT EXISTS idx_refunds_idempotency_key ON refunds(idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- Optional: Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
```

### 3. Update server.js or routes file

**Original approach** (if you have a routes file):

```javascript
// routes/refund.js (or similar)
const express = require('express');
const RefundRepository = require('../repository/RefundRepository');
const RefundService = require('../services/RefundService');
const RefundController = require('../controllers/RefundController');
const { refundQueue } = require('../config/queue');
const db = require('../config/db');

const router = express.Router();

// Initialize dependencies
const refundRepository = new RefundRepository(db);
const refundService = new RefundService(refundRepository, refundQueue);
const refundController = new RefundController(refundService);

// Register route
router.post(
  '/api/v1/payments/:payment_id/refunds',
  refundController.createRefund
);

module.exports = router;
```

Then in your main server file:

```javascript
// server.js
const express = require('express');
const refundRoutes = require('./routes/refund');

const app = express();

app.use(express.json());

// Register refund routes
app.use(refundRoutes);

// ... rest of your server setup
```

**Alternative approach** (if routes are in server.js):

```javascript
// server.js
const express = require('express');
const RefundRepository = require('./repository/RefundRepository');
const RefundService = require('./services/RefundService');
const RefundController = require('./controllers/RefundController');
const { refundQueue } = require('./config/queue');
const db = require('./config/db');

const app = express();

app.use(express.json());

// Initialize refund dependencies once at startup
const refundRepository = new RefundRepository(db);
const refundService = new RefundService(refundRepository, refundQueue);
const refundController = new RefundController(refundService);

// Register route
app.post(
  '/api/v1/payments/:payment_id/refunds',
  refundController.createRefund
);

// ... rest of your server setup

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### 4. Install Dependencies (if needed)

Make sure you have the required packages:

```bash
npm install pg bullmq ioredis dotenv uuid
```

Update package.json if uuid is not already installed:

```bash
npm install uuid
```

### 5. Run Tests

```bash
# Install jest if not already installed
npm install --save-dev jest

# Run all tests
npm test

# Run specific test file
npm test -- backend/src/__tests__/refund.test.js

# Run with coverage
npm test -- --coverage
```

### 6. Test the API Endpoint

Start your server:

```bash
npm start
```

Test the refund endpoint:

```bash
# Create a refund
curl -X POST http://localhost:3000/api/v1/payments/pay_123/refunds \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-123" \
  -d '{
    "amount": 1000,
    "reason": "Customer requested"
  }'

# Expected Response (201):
{
  "id": "rfnd_abc123def456",
  "payment_id": "pay_123",
  "amount": 1000,
  "status": "pending",
  "created_at": "2026-01-16T10:30:00Z"
}
```

## Deployment Steps

### Step 1: Prepare Code

```bash
# Clone/pull latest code
git pull origin main

# Install dependencies
npm install

# Run tests
npm test

# Build if needed
npm run build
```

### Step 2: Database Migration

```bash
# Back up database
pg_dump payment_gateway > backup_$(date +%Y%m%d_%H%M%S).sql

# Run migrations
psql -U gateway_user -d payment_gateway < migrations/add_refund_columns.sql

# Or run manually:
# ALTER TABLE refunds ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;
# ALTER TABLE refunds ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
# ALTER TABLE refunds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
# CREATE INDEX IF NOT EXISTS idx_refunds_idempotency_key ON refunds(idempotency_key);
```

### Step 3: Deploy Code

```bash
# Option 1: Docker (if using containers)
docker-compose down
docker-compose up -d

# Option 2: PM2 (if using process manager)
pm2 restart all
pm2 save

# Option 3: Manual restart
systemctl restart payment-gateway
# or
kill $(pgrep -f "node.*server.js")
sleep 2
node backend/src/server.js
```

### Step 4: Verify Deployment

```bash
# Check if service is running
curl http://localhost:3000/health

# Test the refund endpoint
curl -X POST http://localhost:3000/api/v1/payments/pay_test_123/refunds \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "reason": "test"}' \
  2>&1 | grep -q "rfnd_" && echo "✓ Endpoint working" || echo "✗ Endpoint failed"

# Check logs
tail -f logs/server.log
# or
docker logs payment-gateway-api
```

### Step 5: Monitor

```bash
# Watch for errors
pm2 logs
# or
docker logs -f payment-gateway-api

# Monitor process
pm2 status
# or
docker ps

# Check database
psql -U gateway_user -d payment_gateway \
  -c "SELECT * FROM refunds ORDER BY created_at DESC LIMIT 10;"
```

## Rollback Procedure

If something goes wrong:

```bash
# Stop current deployment
docker-compose down
# or
pm2 stop all

# Restore old code
git checkout main~1

# Reinstall if needed
npm install

# Restore database
psql -U gateway_user -d payment_gateway < backup_YYYYMMDD_HHMMSS.sql

# Start old version
npm start
```

## Zero-Downtime Deployment (Blue-Green)

For production environments:

```bash
# Terminal 1: Start new version on different port
PORT=3001 npm start

# Terminal 2: Run tests against new version
npm test -- --apiUrl=http://localhost:3001

# Terminal 3: Switch load balancer/reverse proxy
# Update nginx/haproxy config to point to :3001

# Kill old version once stable
kill $(lsof -t -i:3000)
```

## Monitoring and Metrics

Add monitoring to track refund performance:

```javascript
// In RefundService constructor or middleware
app.use((req, res, next) => {
  if (req.path === '/api/v1/payments/:payment_id/refunds') {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[METRICS] Refund API - Status: ${res.statusCode} - Duration: ${duration}ms`);
      
      // Send to monitoring service (DataDog, New Relic, etc.)
      // sendMetric('refund.api.duration', duration);
      // sendMetric('refund.api.status_' + res.statusCode, 1);
    });
  }
  next();
});
```

## Common Issues and Solutions

### Issue 1: "idempotency_key" column doesn't exist

**Solution**: Run database migration
```sql
ALTER TABLE refunds ADD COLUMN idempotency_key VARCHAR(255) UNIQUE;
```

### Issue 2: Duplicate refund requests

**Solution**: Ensure idempotency_key is passed and database index exists
```sql
CREATE INDEX idx_refunds_idempotency_key ON refunds(idempotency_key) 
  WHERE idempotency_key IS NOT NULL;
```

### Issue 3: Service not finding RefundRepository

**Solution**: Ensure file paths are correct in require statements
```javascript
// Check that paths match your directory structure
const RefundRepository = require('../repository/RefundRepository');
const RefundService = require('../services/RefundService');
const RefundController = require('../controllers/RefundController');
```

### Issue 4: Tests failing with "Cannot find module"

**Solution**: Ensure jest.config.js is configured properly
```javascript
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/**/*.test.js'],
};
```

### Issue 5: Queue jobs not processing

**Solution**: Ensure Redis is running and accessible
```bash
redis-cli ping  # Should respond with PONG
docker ps | grep redis  # If using Docker
```

## Performance Considerations

### Database Optimization

```sql
-- Ensure these indexes exist for optimal performance
CREATE INDEX idx_payments_id ON payments(id);
CREATE INDEX idx_refunds_payment_id ON refunds(payment_id);
CREATE INDEX idx_refunds_status ON refunds(status);
CREATE INDEX idx_refunds_idempotency_key ON refunds(idempotency_key) WHERE idempotency_key IS NOT NULL;
```

### Caching Strategy

For high-volume scenarios, consider caching:

```javascript
// Cache payment lookups
class CachedRefundRepository extends RefundRepository {
  async getPaymentById(paymentId) {
    const cacheKey = `payment:${paymentId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    
    const payment = await super.getPaymentById(paymentId);
    await redis.setex(cacheKey, 300, JSON.stringify(payment)); // 5 min cache
    return payment;
  }
}
```

### Connection Pooling

Ensure database connection pool is optimized:

```javascript
// In config/db.js
const pool = new Pool({
  // ... other config ...
  max: 20,                    // Maximum connections
  idleTimeoutMillis: 30000,   // Close idle connections
  connectionTimeoutMillis: 2000,
});
```

## Logging

Add comprehensive logging:

```javascript
// In RefundService
class RefundService {
  async processRefund(paymentId, amount, reason, idempotencyKey) {
    console.log(`[RefundService] Processing refund for payment: ${paymentId}, amount: ${amount}`);
    
    try {
      // ... existing logic ...
      console.log(`[RefundService] Refund created: ${refund.id}`);
      return refund;
    } catch (error) {
      console.error(`[RefundService] Error processing refund: ${error.message}`, error);
      throw error;
    }
  }
}
```

## Continuous Integration

Add to your CI/CD pipeline (.github/workflows/test.yml):

```yaml
name: Test & Deploy

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: password
      redis:
        image: redis:6

    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '14'
      
      - run: npm install
      - run: npm test
      - run: npm run lint
```

---

**Deployment Checklist**:
- [ ] All tests passing locally
- [ ] Database migration tested
- [ ] New files copied to correct directories
- [ ] server.js updated with new route
- [ ] Dependencies installed
- [ ] Environment variables configured
- [ ] Database backups created
- [ ] Load balancer configured (if applicable)
- [ ] Monitoring configured
- [ ] Rollback procedure documented
- [ ] Team notified
- [ ] Deployment executed
- [ ] API endpoint tested in production
- [ ] Monitor logs for errors
- [ ] Update documentation

