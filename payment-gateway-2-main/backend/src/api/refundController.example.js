/**
 * Example Integration: How to use the refactored RefundController
 * 
 * This file demonstrates how to integrate the new OOP-based controller
 * into your Express application.
 * 
 * To use this pattern:
 * 1. Instantiate RefundRepository with your database connection
 * 2. Instantiate RefundService with the repository and refund queue
 * 3. Instantiate RefundController with the service
 * 4. Register the controller method as middleware on your Express route
 */

const express = require('express');
const { refundQueue } = require('../config/queue');
const db = require('../config/db');

// Import the new classes
const RefundRepository = require('../repository/RefundRepository');
const RefundService = require('../services/RefundService');
const RefundController = require('../controllers/RefundController');

// Create router
const router = express.Router();

// Initialize dependencies
const refundRepository = new RefundRepository(db);
const refundService = new RefundService(refundRepository, refundQueue);
const refundController = new RefundController(refundService);

/**
 * POST /api/v1/payments/:payment_id/refunds
 * 
 * Create a new refund for a payment
 * 
 * Request Body:
 * {
 *   "amount": 1000,
 *   "reason": "Customer requested",
 *   "idempotencyKey": "optional-unique-key-for-duplicate-prevention"
 * }
 * 
 * Response (201):
 * {
 *   "id": "rfnd_abc123def456",
 *   "payment_id": "pay_xyz789",
 *   "amount": 1000,
 *   "status": "pending",
 *   "created_at": "2026-01-16T10:30:00Z"
 * }
 * 
 * Error Response (400/404/500):
 * {
 *   "error": {
 *     "code": "REFUND_AMOUNT_EXCEEDS_LIMIT",
 *     "description": "Refund amount exceeds available amount"
 *   }
 * }
 */
router.post('/api/v1/payments/:payment_id/refunds', refundController.createRefund);

module.exports = router;

/**
 * MIGRATION GUIDE:
 * ================
 * 
 * Old Approach (Functional Middleware):
 * ```
 * app.post('/api/v1/payments/:payment_id/refunds', async (req, res) => {
 *   // All logic mixed together - hard to test, extend, or reuse
 * });
 * ```
 * 
 * New Approach (OOP with Service Layer):
 * ```
 * const refundRepository = new RefundRepository(db);
 * const refundService = new RefundService(refundRepository, refundQueue);
 * const refundController = new RefundController(refundService);
 * 
 * router.post(
 *   '/api/v1/payments/:payment_id/refunds',
 *   refundController.createRefund
 * );
 * ```
 * 
 * BENEFITS:
 * =========
 * 1. Single Responsibility Principle:
 *    - RefundController: HTTP handling only
 *    - RefundService: Business logic only
 *    - RefundRepository: Data access only
 * 
 * 2. Testability:
 *    - Each layer can be unit tested independently
 *    - Service logic can be tested without HTTP layer
 *    - Repository can be mocked for service tests
 * 
 * 3. Reusability:
 *    - Service can be used by other controllers (CLI, gRPC, etc.)
 *    - Repository can be used by other services
 * 
 * 4. Maintainability:
 *    - Clear separation of concerns
 *    - Easy to locate and fix bugs
 *    - Easy to add new features
 * 
 * 5. Idempotency Support:
 *    - Built-in idempotency checking
 *    - Prevents duplicate refunds
 *    - Client can safely retry requests
 * 
 * DATABASE SCHEMA CHANGES (if needed):
 * ====================================
 * If your refunds table doesn't have these columns, add them:
 * 
 * ALTER TABLE refunds ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE;
 * ALTER TABLE refunds ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
 * ALTER TABLE refunds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
 * 
 * Create index for faster idempotency lookups:
 * CREATE INDEX idx_refunds_idempotency_key ON refunds(idempotency_key) WHERE idempotency_key IS NOT NULL;
 */
