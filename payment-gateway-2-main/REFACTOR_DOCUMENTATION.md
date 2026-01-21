# Refund Controller Refactoring - Documentation

## Overview

The payment gateway refund controller has been refactored from a functional middleware approach to an Object-Oriented (OOP) class-based architecture with a clear service layer. This refactoring follows **SOLID principles** and improves code maintainability, testability, and scalability.

## Architecture

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    HTTP Layer (Express)                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  RefundController                                           │
│  ├─ Handles HTTP requests/responses                         │
│  ├─ Input validation                                        │
│  ├─ Error formatting                                        │
│  └─ Delegates to RefundService                              │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                   Business Logic Layer                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  RefundService                                              │
│  ├─ Idempotency checks                                      │
│  ├─ Payment validation                                      │
│  ├─ Refund amount validation                                │
│  ├─ Refund creation orchestration                           │
│  ├─ Queue job enqueuing                                     │
│  └─ Delegates to RefundRepository for data operations       │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                   Data Access Layer                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  RefundRepository                                           │
│  ├─ Payment data retrieval                                  │
│  ├─ Refund amount calculations                              │
│  ├─ Idempotency key lookups                                 │
│  ├─ Refund record creation                                  │
│  ├─ Refund status updates                                   │
│  └─ All database operations                                 │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                   Database Layer                             │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL Database                                        │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. RefundController (`src/controllers/RefundController.js`)

**Responsibility**: Handle HTTP requests and responses

**Key Features**:
- Receives HTTP requests
- Validates input parameters
- Calls RefundService to process business logic
- Formats and returns HTTP responses
- Handles and formats errors

**Methods**:
- `createRefund(req, res)` - Main handler for POST /api/v1/payments/:payment_id/refunds
- `_validateRefundInput()` - Input validation
- `_handleError()` - Error response formatting
- `_createValidationError()` - Validation error creation

**Example Usage**:
```javascript
const refundController = new RefundController(refundService);
router.post('/api/v1/payments/:payment_id/refunds', refundController.createRefund);
```

### 2. RefundService (`src/services/RefundService.js`)

**Responsibility**: Implement business logic for refund processing

**Key Features**:
- Idempotency checks to prevent duplicate refunds
- Payment validation (exists and is in refundable state)
- Total refunded amount calculation
- Refund amount validation
- Refund creation orchestration
- Queue job management

**Methods**:
- `processRefund(paymentId, requestedAmount, reason, idempotencyKey)` - Main business logic
- `_generateRefundId()` - Unique refund ID generation
- `_createError()` - Error object creation

**Key Logic Flow**:
1. Check for idempotency (return existing refund if found)
2. Validate payment exists and is in refundable state
3. Calculate total already refunded
4. Validate refund amount doesn't exceed available
5. Generate refund ID
6. Create refund record
7. Enqueue processing job

### 3. RefundRepository (`src/repository/RefundRepository.js`)

**Responsibility**: Abstract all database operations

**Key Features**:
- Payment data retrieval
- Refund amount aggregation
- Idempotency key management
- Refund record creation and updates
- All SQL queries centralized

**Methods**:
- `getPaymentById(paymentId)` - Fetch payment
- `getTotalRefundedAmount(paymentId)` - Sum refunded amounts
- `findRefundByIdempotencyKey(idempotencyKey)` - Idempotency lookup
- `createRefund(refundData)` - Insert new refund
- `getRefundById(refundId)` - Fetch refund
- `updateRefundStatus(refundId, status)` - Update refund status

## Benefits of This Architecture

### ✅ Single Responsibility Principle
Each class has one reason to change:
- **RefundController** changes when HTTP handling needs change
- **RefundService** changes when business logic needs change
- **RefundRepository** changes when database schema needs change

### ✅ Testability
Each layer can be tested independently:

```javascript
// Test Service without HTTP layer
describe('RefundService', () => {
  it('should create refund for valid payment', async () => {
    const mockRepo = { /* mock methods */ };
    const mockQueue = { /* mock queue */ };
    const service = new RefundService(mockRepo, mockQueue);
    
    const result = await service.processRefund('pay_123', 1000, 'reason');
    expect(result.id).toBeDefined();
  });
});

// Test Controller without hitting database
describe('RefundController', () => {
  it('should return 201 on successful refund', async () => {
    const mockService = { 
      processRefund: jest.fn().mockResolvedValue({ /* mock refund */ })
    };
    const controller = new RefundController(mockService);
    
    const req = { params: { payment_id: 'pay_123' }, body: { /* ... */ } };
    const res = { status: jest.fn().json: jest.fn() };
    
    await controller.createRefund(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
```

### ✅ Reusability
The RefundService can be used in multiple contexts:

```javascript
// Use in Express controller
const refundController = new RefundController(refundService);

// Use in CLI command
class RefundCLI {
  constructor(refundService) { this.service = refundService; }
  async refund(paymentId, amount, reason) {
    return this.service.processRefund(paymentId, amount, reason);
  }
}

// Use in background job
class RefundBatchProcessor {
  constructor(refundService) { this.service = refundService; }
  async processPending(batch) {
    for (const item of batch) {
      await this.service.processRefund(item.paymentId, item.amount, item.reason);
    }
  }
}
```

### ✅ Idempotency Support
Built-in duplicate prevention:

```javascript
// Client can safely retry (e.g., due to network timeout)
const response1 = await fetch('/api/v1/payments/pay_123/refunds', {
  method: 'POST',
  headers: { 'Idempotency-Key': 'unique-key-123' },
  body: JSON.stringify({ amount: 1000, reason: 'Customer requested' })
});

// Even if retried multiple times, only one refund is created
const response2 = await fetch('/api/v1/payments/pay_123/refunds', {
  method: 'POST',
  headers: { 'Idempotency-Key': 'unique-key-123' }, // Same key
  body: JSON.stringify({ amount: 1000, reason: 'Customer requested' })
});

// response2 returns the same refund from response1
```

### ✅ Error Handling
Consistent, structured error responses:

```javascript
// Error format is consistent across all error types
{
  "error": {
    "code": "PAYMENT_NOT_FOUND",
    "description": "Payment not found"
  }
}
```

## Integration Steps

### Step 1: Update Database Schema (if needed)

```sql
-- Add columns to support idempotency and timestamps
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create index for faster idempotency lookups
CREATE INDEX idx_refunds_idempotency_key ON refunds(idempotency_key) 
  WHERE idempotency_key IS NOT NULL;
```

### Step 2: Update server.js or router file

```javascript
const RefundRepository = require('./repository/RefundRepository');
const RefundService = require('./services/RefundService');
const RefundController = require('./controllers/RefundController');
const { refundQueue } = require('./config/queue');
const db = require('./config/db');

// Initialize dependencies (do this once at app startup)
const refundRepository = new RefundRepository(db);
const refundService = new RefundService(refundRepository, refundQueue);
const refundController = new RefundController(refundService);

// Register route
app.post(
  '/api/v1/payments/:payment_id/refunds',
  refundController.createRefund
);
```

### Step 3: Test the Integration

```javascript
// Test successful refund
curl -X POST http://localhost:3000/api/v1/payments/pay_123/refunds \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-123" \
  -d '{
    "amount": 1000,
    "reason": "Customer requested refund"
  }'

// Response (201):
{
  "id": "rfnd_abc123def456",
  "payment_id": "pay_123",
  "amount": 1000,
  "status": "pending",
  "created_at": "2026-01-16T10:30:00Z"
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_PAYMENT_ID` | 400 | Invalid payment ID format |
| `MISSING_AMOUNT` | 400 | Refund amount is required |
| `INVALID_AMOUNT` | 400 | Amount must be a positive number |
| `MISSING_REASON` | 400 | Refund reason is required |
| `PAYMENT_NOT_FOUND` | 404 | Payment not found |
| `BAD_REQUEST_ERROR` | 400 | Payment not in refundable state |
| `REFUND_AMOUNT_EXCEEDS_LIMIT` | 400 | Refund exceeds available amount |
| `INVALID_REFUND_AMOUNT` | 400 | Refund amount must be > 0 |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

## SOLID Principles Applied

### S - Single Responsibility Principle
Each class has one reason to change.

### O - Open/Closed Principle
Classes are open for extension but closed for modification:
- Can add new services without changing existing code
- Can create new controllers for different APIs

### L - Liskov Substitution Principle
Any service implementing the same interface can be swapped:
```javascript
// Can swap implementation without changing controller
const refundService = new RefundService(refundRepository, refundQueue);
// or
const refundService = new EnhancedRefundService(refundRepository, refundQueue);
```

### I - Interface Segregation Principle
Classes depend on specific, focused interfaces:
- RefundController depends on RefundService interface
- RefundService depends on RefundRepository interface

### D - Dependency Inversion Principle
Dependencies are injected, not created internally:
```javascript
// Constructor injection
const refundService = new RefundService(refundRepository, refundQueue);
```

## Future Enhancements

1. **Logging and Monitoring**
   - Add structured logging to each layer
   - Track refund processing metrics

2. **Authorization**
   - Add merchant validation
   - Add role-based access control

3. **Audit Trail**
   - Store refund history
   - Track who initiated refunds

4. **Partial Refunds**
   - Support multiple partial refunds
   - Track refund breakdown

5. **Retry Logic**
   - Implement exponential backoff for failed refunds
   - Auto-retry pending refunds after timeout

6. **Database Transactions**
   - Wrap refund creation and queue operations in transactions
   - Ensure consistency

## File Structure

```
backend/
├── src/
│   ├── api/
│   │   ├── refundController.js (old - can be removed)
│   │   └── refundController.example.js (integration guide)
│   ├── controllers/
│   │   └── RefundController.js (new - HTTP layer)
│   ├── services/
│   │   └── RefundService.js (new - business logic)
│   ├── repository/
│   │   └── RefundRepository.js (new - data access)
│   ├── config/
│   │   ├── db.js
│   │   └── queue.js
│   └── server.js (update with new route registration)
```

## Migration Checklist

- [ ] Copy new files to appropriate directories
- [ ] Update database schema with new columns
- [ ] Update server.js with new route registration
- [ ] Update tests to test new components
- [ ] Remove old refundController.js middleware
- [ ] Deploy and monitor refund endpoint
- [ ] Document API changes for clients
- [ ] Update API documentation

