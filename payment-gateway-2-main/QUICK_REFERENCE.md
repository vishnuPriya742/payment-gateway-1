# Quick Reference Guide

## File Locations

```
backend/src/
├── controllers/RefundController.js          ← HTTP Layer
├── services/RefundService.js                ← Business Logic
├── repository/RefundRepository.js           ← Data Access
├── __tests__/refund.test.js                 ← Unit Tests
└── api/refundController.example.js          ← Integration Example
```

## One-Minute Overview

The refactored payment controller follows a **3-layer architecture**:

1. **RefundController** - Handles HTTP requests/responses
2. **RefundService** - Implements business logic
3. **RefundRepository** - Abstracts database operations

Each layer is independently testable and reusable.

## Key Classes

### RefundController

```javascript
const controller = new RefundController(refundService);

// Use as Express middleware
app.post('/api/v1/payments/:payment_id/refunds', controller.createRefund);
```

**Methods:**
- `createRefund(req, res)` - Handle POST requests

### RefundService

```javascript
const service = new RefundService(refundRepository, refundQueue);

// Process a refund with automatic validation and idempotency
const refund = await service.processRefund(
  paymentId,        // string
  amount,           // number
  reason,           // string
  idempotencyKey    // string (optional)
);

// Returns: { id, payment_id, amount, status, created_at }
```

**Methods:**
- `processRefund(paymentId, amount, reason, idempotencyKey)` - Main method

### RefundRepository

```javascript
const repository = new RefundRepository(db);

// Available methods
await repository.getPaymentById(paymentId);
await repository.getTotalRefundedAmount(paymentId);
await repository.findRefundByIdempotencyKey(key);
await repository.createRefund(refundData);
await repository.getRefundById(refundId);
await repository.updateRefundStatus(refundId, status);
```

## Setup (5 minutes)

### 1. Database
```sql
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
CREATE INDEX idx_refunds_idempotency_key ON refunds(idempotency_key);
```

### 2. Server Code
```javascript
const RefundRepository = require('./repository/RefundRepository');
const RefundService = require('./services/RefundService');
const RefundController = require('./controllers/RefundController');
const { refundQueue } = require('./config/queue');
const db = require('./config/db');

const refundRepository = new RefundRepository(db);
const refundService = new RefundService(refundRepository, refundQueue);
const refundController = new RefundController(refundService);

app.post('/api/v1/payments/:payment_id/refunds', refundController.createRefund);
```

### 3. Test
```bash
npm test
```

## API Usage

### Create Refund
```bash
curl -X POST http://localhost:3000/api/v1/payments/pay_123/refunds \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-123" \
  -d '{
    "amount": 1000,
    "reason": "Customer requested"
  }'
```

**Response (201):**
```json
{
  "id": "rfnd_abc123def456",
  "payment_id": "pay_123",
  "amount": 1000,
  "status": "pending",
  "created_at": "2026-01-16T10:30:00Z"
}
```

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `INVALID_PAYMENT_ID` | 400 | Invalid payment ID format |
| `MISSING_AMOUNT` | 400 | Amount field is required |
| `INVALID_AMOUNT` | 400 | Amount must be positive number |
| `MISSING_REASON` | 400 | Reason field is required |
| `PAYMENT_NOT_FOUND` | 404 | Payment doesn't exist |
| `BAD_REQUEST_ERROR` | 400 | Payment not refundable |
| `REFUND_AMOUNT_EXCEEDS_LIMIT` | 400 | Exceeds available amount |
| `INVALID_REFUND_AMOUNT` | 400 | Amount must be > 0 |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected error |

## Testing

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test -- backend/src/__tests__/refund.test.js
```

### With Coverage
```bash
npm test -- --coverage
```

### Example Test
```javascript
describe('RefundService', () => {
  it('should create refund for valid payment', async () => {
    const mockRepo = {
      getPaymentById: jest.fn().mockResolvedValue({ id: 'pay_123', amount: 5000, status: 'success', merchant_id: 'merch_123' }),
      getTotalRefundedAmount: jest.fn().mockResolvedValue(0),
      createRefund: jest.fn().mockResolvedValue({ id: 'rfnd_123' })
    };
    const mockQueue = { add: jest.fn() };
    const service = new RefundService(mockRepo, mockQueue);

    const result = await service.processRefund('pay_123', 1000, 'reason');
    expect(result.id).toBeDefined();
  });
});
```

## Idempotency Example

```javascript
// First request
const response1 = await fetch('/api/v1/payments/pay_123/refunds', {
  method: 'POST',
  headers: { 'Idempotency-Key': 'key_abc' },
  body: JSON.stringify({ amount: 1000, reason: 'test' })
});
// Returns: { id: 'rfnd_123', ... }

// Retry with same key - returns same refund (no duplicate!)
const response2 = await fetch('/api/v1/payments/pay_123/refunds', {
  method: 'POST',
  headers: { 'Idempotency-Key': 'key_abc' },
  body: JSON.stringify({ amount: 1000, reason: 'test' })
});
// Returns: { id: 'rfnd_123', ... } // SAME refund
```

## Class Methods Summary

### RefundController.createRefund(req, res)
- **Input**: Express req/res objects
- **Output**: JSON response (201 on success, 400/404/500 on error)
- **Validates**: Payment ID, amount, reason
- **Delegates**: To RefundService.processRefund

### RefundService.processRefund(paymentId, amount, reason, idempotencyKey)
- **Input**: Payment ID, refund amount, reason, optional idempotency key
- **Output**: Refund object { id, payment_id, amount, status, created_at }
- **Validates**: 
  - Idempotency (returns existing refund if found)
  - Payment exists and is successful
  - Amount is positive and doesn't exceed available
- **Delegates**: To RefundRepository for data operations

### RefundRepository Methods
- `getPaymentById(paymentId)` - Fetch payment record
- `getTotalRefundedAmount(paymentId)` - Sum of processed/pending refunds
- `findRefundByIdempotencyKey(key)` - Lookup by idempotency key
- `createRefund(refundData)` - Insert refund record
- `getRefundById(refundId)` - Fetch refund record
- `updateRefundStatus(refundId, status)` - Update status

## Common Patterns

### Using the Service Directly
```javascript
const service = new RefundService(repository, queue);

// In CLI, background job, gRPC, etc.
const refund = await service.processRefund('pay_123', 1000, 'CLI refund');
console.log(`Refund created: ${refund.id}`);
```

### Extending the Service
```javascript
class EnhancedRefundService extends RefundService {
  async processRefundWithApproval(paymentId, amount, reason, approver) {
    // Add custom logic
    const requiresApproval = amount > 1000;
    if (requiresApproval && !approver.canApprove) {
      throw new Error('Approval required');
    }
    
    return this.processRefund(paymentId, amount, reason);
  }
}
```

### Mocking for Tests
```javascript
const mockRepository = {
  getPaymentById: jest.fn(),
  getTotalRefundedAmount: jest.fn(),
  findRefundByIdempotencyKey: jest.fn(),
  createRefund: jest.fn()
};

const mockQueue = {
  add: jest.fn()
};

const service = new RefundService(mockRepository, mockQueue);
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Tests failing | Run `npm install` to ensure all deps are installed |
| Database errors | Check idempotency_key column exists, run migration |
| Module not found | Verify file paths match your directory structure |
| Duplicate refunds | Enable idempotency_key in request header |
| Queue not working | Verify Redis is running: `redis-cli ping` |
| Status code 404 | Check payment_id exists in database |
| Status code 400 | Validate request body (amount > 0, reason provided) |

## Performance Tips

1. **Add database indexes**
   ```sql
   CREATE INDEX idx_payments_id ON payments(id);
   CREATE INDEX idx_refunds_payment_id ON refunds(payment_id);
   ```

2. **Enable caching** for high volume
   ```javascript
   class CachedRepository extends RefundRepository {
     async getPaymentById(id) {
       const cached = await redis.get(`payment:${id}`);
       if (cached) return JSON.parse(cached);
       const payment = await super.getPaymentById(id);
       await redis.setex(`payment:${id}`, 300, JSON.stringify(payment));
       return payment;
     }
   }
   ```

3. **Connection pooling** in database config
   ```javascript
   max: 20,
   idleTimeoutMillis: 30000,
   connectionTimeoutMillis: 2000
   ```

## Related Documentation

- **Full Details**: [REFACTOR_DOCUMENTATION.md](../REFACTOR_DOCUMENTATION.md)
- **Why Change**: [BEFORE_AFTER_COMPARISON.md](../BEFORE_AFTER_COMPARISON.md)
- **Integration**: [INTEGRATION_DEPLOYMENT_GUIDE.md](../INTEGRATION_DEPLOYMENT_GUIDE.md)
- **Example**: [backend/src/api/refundController.example.js](../backend/src/api/refundController.example.js)

---

**Created**: January 16, 2026
**Status**: Ready for Integration
**Questions?** See documentation files above

