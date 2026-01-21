# Implementation Checklist

Use this checklist to ensure smooth integration of the refactored payment controller.

## Pre-Integration Phase

### Understanding the Changes
- [ ] Read [REFACTOR_SUMMARY.md](REFACTOR_SUMMARY.md) (5 min)
- [ ] Review [QUICK_REFERENCE.md](QUICK_REFERENCE.md) (5 min)
- [ ] Study [VISUAL_ARCHITECTURE_GUIDE.md](VISUAL_ARCHITECTURE_GUIDE.md) (10 min)
- [ ] Review files created:
  - [ ] [backend/src/controllers/RefundController.js](backend/src/controllers/RefundController.js)
  - [ ] [backend/src/services/RefundService.js](backend/src/services/RefundService.js)
  - [ ] [backend/src/repository/RefundRepository.js](backend/src/repository/RefundRepository.js)

### Preparation
- [ ] Create development branch: `git checkout -b feature/refactor-refund-controller`
- [ ] Backup current database: `pg_dump payment_gateway > backup_$(date +%Y%m%d_%H%M%S).sql`
- [ ] Ensure all tests pass: `npm test`
- [ ] Ensure node_modules is clean: `npm ci`

## File Integration Phase

### Copy Files
- [ ] Copy `RefundController.js` to `backend/src/controllers/`
- [ ] Copy `RefundService.js` to `backend/src/services/`
- [ ] Copy `RefundRepository.js` to `backend/src/repository/`
- [ ] Copy `refund.test.js` to `backend/src/__tests__/`
- [ ] Verify files are in correct locations:
  ```bash
  ls -la backend/src/controllers/RefundController.js
  ls -la backend/src/services/RefundService.js
  ls -la backend/src/repository/RefundRepository.js
  ls -la backend/src/__tests__/refund.test.js
  ```

### Update Dependencies
- [ ] Ensure `uuid` is installed: `npm list uuid`
- [ ] If missing: `npm install uuid`
- [ ] Verify `pg`, `bullmq`, `ioredis` are installed:
  ```bash
  npm list pg bullmq ioredis
  ```

## Database Migration Phase

### Backup & Verify
- [ ] Confirm backup was created and is valid
- [ ] Test backup restore: `psql -U gateway_user -d payment_gateway_test < backup.sql`
- [ ] Connect to database: `psql -U gateway_user -d payment_gateway`

### Run Migrations
- [ ] Add columns to refunds table:
  ```sql
  ALTER TABLE refunds ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;
  ALTER TABLE refunds ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
  ALTER TABLE refunds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
  ```

### Create Indexes
- [ ] Create primary index:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_refunds_idempotency_key ON refunds(idempotency_key) WHERE idempotency_key IS NOT NULL;
  ```

### Verify Schema
- [ ] Check columns exist:
  ```sql
  \d refunds
  ```
- [ ] Verify columns:
  - [ ] `idempotency_key VARCHAR(255)`
  - [ ] `created_at TIMESTAMP`
  - [ ] `updated_at TIMESTAMP`
- [ ] Check indexes:
  ```sql
  \di idx_refunds*
  ```

## Code Integration Phase

### Update Server Code
- [ ] Open `backend/src/server.js` (or main route file)
- [ ] Add imports at top:
  ```javascript
  const RefundRepository = require('./repository/RefundRepository');
  const RefundService = require('./services/RefundService');
  const RefundController = require('./controllers/RefundController');
  const { refundQueue } = require('./config/queue');
  ```
- [ ] Add initialization after middleware:
  ```javascript
  const refundRepository = new RefundRepository(db);
  const refundService = new RefundService(refundRepository, refundQueue);
  const refundController = new RefundController(refundService);
  ```
- [ ] Replace old route with new one:
  ```javascript
  app.post('/api/v1/payments/:payment_id/refunds', refundController.createRefund);
  ```
- [ ] Remove old route (if exists): Comment out or delete old middleware
- [ ] Verify file syntax: `node -c backend/src/server.js`

### Code Review
- [ ] Have peer review the changes
- [ ] Verify imports are correct
- [ ] Verify route is registered
- [ ] Check for syntax errors

## Testing Phase

### Unit Tests
- [ ] Run all tests: `npm test`
- [ ] Expected output: All tests pass, no failures
- [ ] Run specific test file: `npm test -- backend/src/__tests__/refund.test.js`
- [ ] Generate coverage: `npm test -- --coverage`
- [ ] Coverage should be:
  - [ ] Controllers: >90%
  - [ ] Services: >90%
  - [ ] Repository: >90%

### Manual Testing (Local)
- [ ] Start server: `npm start` or `node backend/src/server.js`
- [ ] Verify server started without errors
- [ ] Check logs: "Server running on port 3000"

#### Test 1: Valid Refund
```bash
curl -X POST http://localhost:3000/api/v1/payments/pay_123/refunds \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "reason": "Customer requested"
  }' | jq .
```
- [ ] Response status: 201
- [ ] Response has: `id`, `payment_id`, `amount`, `status`, `created_at`

#### Test 2: Invalid Amount (0)
```bash
curl -X POST http://localhost:3000/api/v1/payments/pay_123/refunds \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 0,
    "reason": "test"
  }' | jq .
```
- [ ] Response status: 400
- [ ] Error code: `INVALID_AMOUNT`

#### Test 3: Missing Reason
```bash
curl -X POST http://localhost:3000/api/v1/payments/pay_123/refunds \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000
  }' | jq .
```
- [ ] Response status: 400
- [ ] Error code: `MISSING_REASON`

#### Test 4: Idempotency
```bash
# First request
curl -X POST http://localhost:3000/api/v1/payments/pay_123/refunds \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: key_test_123" \
  -d '{"amount": 500, "reason": "test"}' | jq . -r '.id'
# Save the ID

# Second request (same key)
curl -X POST http://localhost:3000/api/v1/payments/pay_123/refunds \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: key_test_123" \
  -d '{"amount": 500, "reason": "test"}' | jq . -r '.id'
```
- [ ] Both requests return the SAME refund ID
- [ ] Only one record in database

### Database Verification
```bash
psql -U gateway_user -d payment_gateway
SELECT * FROM refunds ORDER BY created_at DESC LIMIT 5;
```
- [ ] Verify refunds exist
- [ ] Verify columns are populated correctly
- [ ] Verify `idempotency_key` works

## Staging Deployment Phase

### Pre-Deployment
- [ ] All tests pass locally
- [ ] Code review completed
- [ ] Database backup created
- [ ] Rollback plan documented

### Deploy to Staging
- [ ] Build: `npm run build` (if applicable)
- [ ] Stop staging server
- [ ] Deploy code: `git pull origin feature/refactor-refund-controller`
- [ ] Run migrations on staging database
- [ ] Start staging server
- [ ] Verify server started: Check logs and health endpoint

### Staging Tests
- [ ] Run full test suite: `npm test`
- [ ] Manual API tests (repeat from manual testing phase)
- [ ] Load test (optional): `npm run test:load`
- [ ] Monitor logs for errors: `tail -f logs/staging.log`
- [ ] Check database for issues
- [ ] Test rollback scenario

### Team Notification
- [ ] Notify QA team: Changes deployed to staging
- [ ] Provide test cases
- [ ] Provide rollback instructions
- [ ] Wait for QA sign-off

## Production Deployment Phase

### Pre-Production
- [ ] QA sign-off received
- [ ] Production backup created
- [ ] Monitoring alerts configured
- [ ] Rollback plan reviewed with ops team
- [ ] Deployment window scheduled

### Deployment Options

#### Option A: Standard Deployment
- [ ] Stop production server (planned downtime)
- [ ] Deploy code
- [ ] Run migrations
- [ ] Start server
- [ ] Verify endpoint
- [ ] **Downtime**: 5-10 minutes

#### Option B: Blue-Green Deployment (Zero Downtime)
- [ ] Start new version (port 3001)
- [ ] Run tests against new version
- [ ] Update load balancer to new version
- [ ] Stop old version
- [ ] **Downtime**: 0 seconds (recommended for production)

- [ ] New version running on port 3001
- [ ] Tests passing on new version
- [ ] Load balancer updated
- [ ] Old version stopped
- [ ] Monitoring shows healthy traffic

### Post-Deployment
- [ ] Server started without errors
- [ ] Health check passing: `curl http://your-api/health`
- [ ] API responding correctly
- [ ] Database queries working
- [ ] Queue jobs processing
- [ ] Logs show no errors
- [ ] Monitoring metrics healthy

### Production Tests
- [ ] Manual API test (valid refund)
- [ ] Manual API test (invalid refund)
- [ ] Check database for refunds
- [ ] Verify queue jobs processed
- [ ] Monitor error rates in next 30 minutes

## Verification Phase

### API Endpoint
- [ ] Endpoint is responsive
- [ ] Valid requests return 201
- [ ] Invalid requests return 400/404/500
- [ ] Idempotency works correctly
- [ ] Timestamps are populated
- [ ] Queue jobs are created

### Database
```bash
psql -U gateway_user -d payment_gateway
SELECT COUNT(*) FROM refunds;
SELECT * FROM refunds WHERE created_at > NOW() - INTERVAL '1 hour';
```
- [ ] Refunds are being created
- [ ] Timestamps are correct
- [ ] Idempotency keys are stored

### Monitoring
- [ ] Error rate is normal (<1%)
- [ ] Response time is acceptable (<500ms)
- [ ] No database connection errors
- [ ] No queue errors
- [ ] Logs are clean

## Rollback Phase (If Needed)

### Immediate Rollback
- [ ] Switch load balancer back to old version
- [ ] Stop new version
- [ ] Verify traffic on old version
- [ ] Monitor error rates

### Database Rollback (If Migrations Failed)
```bash
psql -U gateway_user -d payment_gateway < backup.sql
```
- [ ] Restore database from backup
- [ ] Verify data integrity
- [ ] Restart old version

### Rollback Checklist
- [ ] Old version running
- [ ] Database reverted
- [ ] Traffic flowing to old version
- [ ] Error rate normalized
- [ ] Team notified

## Post-Deployment Phase

### Documentation
- [ ] Update API documentation
- [ ] Update deployment guide
- [ ] Add troubleshooting section
- [ ] Document new error codes

### Monitoring (24-48 hours)
- [ ] Watch error logs for issues
- [ ] Monitor performance metrics
- [ ] Watch database growth
- [ ] Watch queue processing

### Team Communication
- [ ] Notify team of successful deployment
- [ ] Share new features (idempotency support)
- [ ] Share API documentation updates
- [ ] Schedule training if needed

## Old Code Cleanup (After 1 week)
- [ ] Remove old `refundController.js` from `api/` directory
- [ ] Update codebase references
- [ ] Update documentation
- [ ] Commit: "Remove old functional refund controller"

## Sign-Off

- [ ] **Development**: _________________ Date: _______
- [ ] **QA**: _________________ Date: _______
- [ ] **DevOps**: _________________ Date: _______
- [ ] **Product Manager**: _________________ Date: _______

---

## Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| DevOps Lead | | | |
| Database Admin | | | |
| On-Call Engineer | | | |
| Product Owner | | | |

---

## Troubleshooting

### Issue: "Cannot find module 'RefundController'"
**Solution**: Check file paths in import statements match your directory structure
```javascript
// Verify path
const RefundController = require('./controllers/RefundController');
// Should match actual file location
```

### Issue: "idempotency_key column doesn't exist"
**Solution**: Run database migration
```sql
ALTER TABLE refunds ADD COLUMN idempotency_key VARCHAR(255) UNIQUE;
```

### Issue: Tests failing
**Solution**: Ensure all dependencies installed
```bash
npm install
npm test
```

### Issue: Port already in use
**Solution**: Kill existing process
```bash
# Find process
lsof -i :3000
# Kill it
kill -9 <PID>
```

### Issue: Database connection error
**Solution**: Check connection string in .env
```bash
# Verify credentials
echo $DB_USER $DB_HOST $DB_PORT
# Test connection
psql -U $DB_USER -h $DB_HOST -d payment_gateway
```

---

**Last Updated**: January 16, 2026
**Status**: Ready for Implementation

