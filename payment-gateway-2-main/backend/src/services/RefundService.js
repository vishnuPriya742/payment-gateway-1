const { v4: uuidv4 } = require('uuid');

/**
 * RefundService - Handles all business logic related to refunds
 * Responsible for:
 * - Idempotency checks
 * - Validation
 * - Refund creation and database operations
 * - Queue management
 * 
 * Follows Single Responsibility Principle by separating business logic
 * from HTTP handling and data access
 */
class RefundService {
  constructor(refundRepository, refundQueue) {
    this.refundRepository = refundRepository;
    this.refundQueue = refundQueue;
  }

  /**
   * Process a refund request with idempotency and validation
   * @param {string} paymentId - The payment ID to refund
   * @param {number} requestedAmount - The amount to refund
   * @param {string} reason - The reason for refund
   * @param {string} idempotencyKey - Optional idempotency key for duplicate prevention
   * @returns {Promise<Object>} - Refund object with id, payment_id, amount, status
   * @throws {Error} - Custom errors with specific codes and messages
   */
  async processRefund(paymentId, requestedAmount, reason, idempotencyKey = null) {
    // 1. Check for idempotency - if same request was already processed, return existing refund
    if (idempotencyKey) {
      const existingRefund = await this.refundRepository.findRefundByIdempotencyKey(idempotencyKey);
      if (existingRefund) {
        return existingRefund;
      }
    }

    // 2. Fetch and validate the original payment
    const payment = await this.refundRepository.getPaymentById(paymentId);
    if (!payment) {
      throw this._createError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    }

    if (payment.status !== 'success') {
      throw this._createError(
        'BAD_REQUEST_ERROR',
        'Payment not in refundable state',
        400
      );
    }

    // 3. Calculate total already refunded
    const totalRefunded = await this.refundRepository.getTotalRefundedAmount(paymentId);

    // 4. Validate refund amount
    if (requestedAmount + totalRefunded > payment.amount) {
      throw this._createError(
        'REFUND_AMOUNT_EXCEEDS_LIMIT',
        'Refund amount exceeds available amount',
        400
      );
    }

    if (requestedAmount <= 0) {
      throw this._createError(
        'INVALID_REFUND_AMOUNT',
        'Refund amount must be greater than 0',
        400
      );
    }

    // 5. Generate refund ID
    const refundId = this._generateRefundId();

    // 6. Create refund record in database with idempotency key
    const refund = await this.refundRepository.createRefund({
      id: refundId,
      paymentId,
      merchantId: payment.merchant_id,
      amount: requestedAmount,
      reason,
      status: 'pending',
      idempotencyKey
    });

    // 7. Enqueue refund processing job
    await this.refundQueue.add('process-refund', { refundId });

    return refund;
  }

  /**
   * Generate a unique refund ID
   * @private
   * @returns {string} - Refund ID
   */
  _generateRefundId() {
    return 'rfnd_' + uuidv4().replace(/-/g, '').substring(0, 16);
  }

  /**
   * Create a structured error object
   * @private
   * @param {string} code - Error code
   * @param {string} description - Error description
   * @param {number} statusCode - HTTP status code
   * @returns {Error} - Custom error object
   */
  _createError(code, description, statusCode = 400) {
    const error = new Error(description);
    error.code = code;
    error.statusCode = statusCode;
    return error;
  }
}

module.exports = RefundService;
