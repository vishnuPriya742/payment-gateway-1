# Visual Architecture Guide

## Layer-by-Layer Breakdown

### Layer 1: Controller (HTTP Entry Point)

```
┌──────────────────────────────────────────────┐
│         HTTP Request (Express)               │
│  POST /api/v1/payments/:payment_id/refunds   │
│  Content-Type: application/json              │
│  {                                           │
│    "amount": 1000,                           │
│    "reason": "Customer requested",           │
│    "idempotencyKey": "optional-key"          │
│  }                                           │
└──────────────────────────────────────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  RefundController          │
        │ ┌───────────────────────┐  │
        │ │ createRefund(req,res) │  │
        │ ├───────────────────────┤  │
        │ │ • Extract parameters  │  │
        │ │ • Validate input      │  │
        │ │ • Format error        │  │
        │ └───────────────────────┘  │
        └─────────────┬───────────────┘
                      │
                      ▼ (delegates to)
        
```

**Responsibilities:**
- ✓ Parse HTTP request
- ✓ Validate request format
- ✓ Call business logic
- ✓ Format HTTP response
- ✓ Handle HTTP errors

**Does NOT:**
- ✗ Access database directly
- ✗ Process business logic
- ✗ Check idempotency
- ✗ Validate amounts

---

### Layer 2: Service (Business Logic)

```
        ┌────────────────────────────────────────────┐
        │  RefundService                             │
        │ ┌──────────────────────────────────────┐   │
        │ │ processRefund(paymentId, amount,     │   │
        │ │   reason, idempotencyKey)            │   │
        │ ├──────────────────────────────────────┤   │
        │ │ 1. Check Idempotency                 │   │
        │ │    If found, return existing refund  │   │
        │ │                                      │   │
        │ │ 2. Validate Payment                  │   │
        │ │    • Must exist                      │   │
        │ │    • Must be 'success' status        │   │
        │ │                                      │   │
        │ │ 3. Calculate Total Refunded          │   │
        │ │    • Sum of processed + pending      │   │
        │ │                                      │   │
        │ │ 4. Validate Amount                   │   │
        │ │    • Must be positive                │   │
        │ │    • Must not exceed available       │   │
        │ │                                      │   │
        │ │ 5. Create Refund Record              │   │
        │ │    • Generate unique ID              │   │
        │ │    • Call repository                 │   │
        │ │                                      │   │
        │ │ 6. Enqueue Processing                │   │
        │ │    • Add to refund queue             │   │
        │ │    • Async processing                │   │
        │ └──────────────────────────────────────┘   │
        └────────────────┬──────────────────────────┘
                         │
                         ▼ (delegates to)
```

**Responsibilities:**
- ✓ Idempotency checking
- ✓ Business rule validation
- ✓ Amount calculations
- ✓ Refund creation workflow
- ✓ Queue management
- ✓ Error creation

**Does NOT:**
- ✗ Handle HTTP
- ✗ Execute SQL directly
- ✗ Know about queue internals
- ✗ Format HTTP responses

---

### Layer 3: Repository (Data Access)

```
        ┌─────────────────────────────────────────────┐
        │  RefundRepository                           │
        │ ┌───────────────────────────────────────┐   │
        │ │ Public Methods                        │   │
        │ ├───────────────────────────────────────┤   │
        │ │ • getPaymentById(id)                  │   │
        │ │   SELECT * FROM payments WHERE id=?  │   │
        │ │                                       │   │
        │ │ • getTotalRefundedAmount(id)          │   │
        │ │   SELECT SUM(amount) FROM refunds    │   │
        │ │   WHERE status IN (...)              │   │
        │ │                                       │   │
        │ │ • findRefundByIdempotencyKey(key)     │   │
        │ │   SELECT * FROM refunds WHERE key=?  │   │
        │ │                                       │   │
        │ │ • createRefund(data)                  │   │
        │ │   INSERT INTO refunds (...)           │   │
        │ │                                       │   │
        │ │ • updateRefundStatus(id, status)      │   │
        │ │   UPDATE refunds SET status=?         │   │
        │ └───────────────────────────────────────┘   │
        └────────────────┬────────────────────────────┘
                         │
                         ▼ (queries)
```

**Responsibilities:**
- ✓ Execute SQL queries
- ✓ Handle database errors
- ✓ Return parsed results
- ✓ Abstract database details
- ✓ Manage transactions

**Does NOT:**
- ✗ Process business logic
- ✗ Validate amounts
- ✗ Create errors
- ✗ Handle HTTP

---

### Layer 4: Database

```
        ┌──────────────────────────────────────┐
        │  PostgreSQL Database                 │
        │ ┌────────────────────────────────┐   │
        │ │ payments table                 │   │
        │ ├────────────────────────────────┤   │
        │ │ id | amount | merchant_id ...  │   │
        │ │ pay_123 | 5000 | merch_1       │   │
        │ └────────────────────────────────┘   │
        │                                      │
        │ ┌────────────────────────────────┐   │
        │ │ refunds table                  │   │
        │ ├────────────────────────────────┤   │
        │ │ id | payment_id | amount ...   │   │
        │ │ rfnd_123 | pay_123 | 1000 ...  │   │
        │ └────────────────────────────────┘   │
        └──────────────────────────────────────┘
```

---

## Request Flow Diagram

```
1. Client Request
   │
   POST /api/v1/payments/pay_123/refunds
   { amount: 1000, reason: "test" }
   │
   ▼
2. Express Routes (middleware)
   │
   ▼
3. RefundController.createRefund()
   ├─ Extract: paymentId, amount, reason, idempotencyKey
   ├─ Validate: format, types, presence
   └─ Call: refundService.processRefund()
      │
      ▼
4. RefundService.processRefund()
   ├─ Step 1: Check idempotency
   │  └─ Call: refundRepository.findRefundByIdempotencyKey()
   │
   ├─ Step 2: Validate payment
   │  └─ Call: refundRepository.getPaymentById()
   │
   ├─ Step 3: Calculate total refunded
   │  └─ Call: refundRepository.getTotalRefundedAmount()
   │
   ├─ Step 4: Validate amount
   │
   ├─ Step 5: Create refund
   │  └─ Call: refundRepository.createRefund()
   │
   └─ Step 6: Enqueue processing
      └─ Call: refundQueue.add()
         │
         ▼
5. RefundRepository Methods
   ├─ Database Query 1: SELECT payment
   ├─ Database Query 2: SELECT SUM(refunded)
   ├─ Database Query 3: SELECT by idempotency_key
   └─ Database Query 4: INSERT refund
      │
      ▼
6. Database Operations
   ├─ Read payments table
   ├─ Read refunds table
   └─ Write to refunds table
      │
      ▼
7. Response Flow (Reverse)
   ├─ Return refund object from Repository
   ├─ Return refund object from Service
   ├─ Format JSON response in Controller
   └─ Return 201 + JSON to client
```

---

## Error Handling Flow

```
RefundController
    │
    ├─ Validation Error (400)
    │  └─ Return error response immediately
    │
    └─ Call RefundService
       │
       RefundService
       ├─ Idempotency Check
       │  └─ If found: return existing
       │  └─ If error: throw with code
       │
       ├─ Get Payment
       │  ├─ Not found (404)
       │  │  └─ Throw PAYMENT_NOT_FOUND
       │  ├─ Wrong status (400)
       │  │  └─ Throw BAD_REQUEST_ERROR
       │  └─ DB error (500)
       │     └─ Throw INTERNAL_SERVER_ERROR
       │
       ├─ Calculate & Validate Amount
       │  ├─ Amount too high (400)
       │  │  └─ Throw REFUND_AMOUNT_EXCEEDS_LIMIT
       │  ├─ Amount invalid (400)
       │  │  └─ Throw INVALID_REFUND_AMOUNT
       │  └─ DB error (500)
       │     └─ Throw INTERNAL_SERVER_ERROR
       │
       └─ Create Refund
          ├─ DB error (500)
          │  └─ Throw INTERNAL_SERVER_ERROR
          └─ Queue error (500)
             └─ Throw INTERNAL_SERVER_ERROR
               │
               ▼
           Controller catches error
               │
               ├─ Extract: statusCode, code, message
               └─ Return error response JSON
```

---

## Idempotency Flow

```
Request #1:
┌─────────────────────────────┐
│ POST /refunds               │
│ Idempotency-Key: key_123    │
│ amount: 1000                │
└────────────────────────────┬┘
                             │
                    ▼
        Check DB: SELECT FROM refunds
        WHERE idempotency_key = 'key_123'
                    │
        Result: NOT FOUND
                    │
        ▼
        Create new refund
        INSERT id=rfnd_123, idempotency_key=key_123
                    │
        ▼
        Return response
        { id: rfnd_123, status: pending }


Request #2 (Retry):
┌─────────────────────────────┐
│ POST /refunds               │
│ Idempotency-Key: key_123    │ ← SAME KEY
│ amount: 1000                │
└────────────────────────────┬┘
                             │
                    ▼
        Check DB: SELECT FROM refunds
        WHERE idempotency_key = 'key_123'
                    │
        Result: FOUND (rfnd_123)
                    │
        ▼
        Return existing refund (no duplicate!)
        { id: rfnd_123, status: pending }
                    │
        Note: Database INSERT was NOT executed
```

---

## Dependency Injection

```
┌──────────────────────────────────────────────────────┐
│  At Application Startup (server.js)                 │
├──────────────────────────────────────────────────────┤
│                                                      │
│  1. Create Database Instance                        │
│     const db = new Pool({...})                       │
│                                                      │
│  2. Create Queue Instance                           │
│     const refundQueue = new Queue({...})             │
│                                                      │
│  3. Instantiate Repository                          │
│     const repo = new RefundRepository(db)            │
│     └─ Injects: db connection                       │
│                                                      │
│  4. Instantiate Service                             │
│     const service = new RefundService(repo, queue)   │
│     └─ Injects: repository, queue                   │
│                                                      │
│  5. Instantiate Controller                          │
│     const controller = new RefundController(service) │
│     └─ Injects: service                             │
│                                                      │
│  6. Register Route                                  │
│     app.post('/api/v1/...', controller.createRefund) │
│                                                      │
└──────────────────────────────────────────────────────┘

Benefits:
✓ Loose coupling - layers don't depend on each other directly
✓ Easy testing - swap real dependencies for mocks
✓ Easy to extend - can create alternative implementations
✓ Clear relationships - see exactly what depends on what
```

---

## Testing Strategy

```
Unit Tests
│
├─ RefundRepository Tests
│  ├─ Mock database (db.query)
│  └─ Test each database method
│     ├─ getPaymentById
│     ├─ getTotalRefundedAmount
│     ├─ findRefundByIdempotencyKey
│     ├─ createRefund
│     └─ updateRefundStatus
│
├─ RefundService Tests
│  ├─ Mock repository (all methods)
│  ├─ Mock queue
│  └─ Test business logic
│     ├─ processRefund (success case)
│     ├─ processRefund (idempotency)
│     ├─ processRefund (payment not found)
│     ├─ processRefund (invalid amount)
│     ├─ processRefund (amount exceeds limit)
│     └─ error handling
│
└─ RefundController Tests
   ├─ Mock service
   └─ Test HTTP handling
      ├─ createRefund (success - 201)
      ├─ createRefund (validation error - 400)
      ├─ createRefund (payment not found - 404)
      ├─ createRefund (server error - 500)
      └─ error formatting

Total: 40+ test cases
No real database access
No real HTTP calls
Fast execution (~100ms)
```

---

## Class Composition

```
Client Code
    │
    ├─ new RefundController(refundService)
    │  └─ Depends on: RefundService
    │
    ├─ new RefundService(repository, queue)
    │  ├─ Depends on: RefundRepository
    │  └─ Depends on: Queue
    │
    └─ new RefundRepository(db)
       └─ Depends on: Database Connection
```

Each dependency is injected via constructor (Dependency Injection Pattern).

---

## Summary

| Layer | Responsibility | Testable | Reusable |
|-------|----------------|----------|----------|
| Controller | HTTP handling | ✓ Yes (mock service) | ✗ HTTP-bound |
| Service | Business logic | ✓ Yes (mock repo/queue) | ✓ Yes (can use anywhere) |
| Repository | Data access | ✓ Yes (mock database) | ✓ Yes (can use in other services) |
| Database | Data storage | - (external) | - (external) |

---

This layered architecture provides:
- ✅ Clear separation of concerns
- ✅ Easy to test
- ✅ Easy to maintain
- ✅ Easy to extend
- ✅ Professional code organization
- ✅ Enterprise software patterns

