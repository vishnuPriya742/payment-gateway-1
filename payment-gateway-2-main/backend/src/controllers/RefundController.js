/**
 * RefundController - HTTP Request Handler
 * Responsible for:
 * - Handling HTTP requests and responses
 * - Input validation and sanitization
 * - Delegating business logic to RefundService
 * - Error handling and response formatting
 * 
 * Follows the Controller Pattern to separate HTTP concerns
 * from business logic
 */
class RefundController {
  constructor(refundService) {
    this.refundService = refundService;
    
    // Bind methods to preserve 'this' context when used as middleware
    this.createRefund = this.createRefund.bind(this);
  }

  /**
   * Handle POST /api/v1/payments/:payment_id/refunds
   * Create a new refund for a payment
   * 
   * @param {Express.Request} req - Express request object
   * @param {Express.Response} res - Express response object
   * @returns {Promise<void>}
   */
  async createRefund(req, res) {
    try {
      const { payment_id: paymentId } = req.params;
      const { amount: requestedAmount, reason, idempotencyKey } = req.body;

      // Validate required parameters
      this._validateRefundInput(paymentId, requestedAmount, reason);

      // Process refund through service
      const refund = await this.refundService.processRefund(
        paymentId,
        requestedAmount,
        reason,
        idempotencyKey
      );

      // Return success response
      return res.status(201).json({
        id: refund.id,
        payment_id: refund.payment_id,
        amount: refund.amount,
        status: refund.status,
        created_at: refund.created_at
      });

    } catch (error) {
      return this._handleError(error, res);
    }
  }

  /**
   * Validate refund input parameters
   * @private
   * @param {string} paymentId - Payment ID
   * @param {number} requestedAmount - Refund amount
   * @param {string} reason - Refund reason
   * @throws {Error} - If validation fails
   */
  _validateRefundInput(paymentId, requestedAmount, reason) {
    if (!paymentId || typeof paymentId !== 'string') {
      throw this._createValidationError('INVALID_PAYMENT_ID', 'Invalid payment ID format');
    }

    if (requestedAmount === undefined || requestedAmount === null) {
      throw this._createValidationError('MISSING_AMOUNT', 'Refund amount is required');
    }

    if (typeof requestedAmount !== 'number' || requestedAmount <= 0) {
      throw this._createValidationError('INVALID_AMOUNT', 'Refund amount must be a positive number');
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw this._createValidationError('MISSING_REASON', 'Refund reason is required');
    }
  }

  /**
   * Handle errors and format error responses
   * @private
   * @param {Error} error - Error object
   * @param {Express.Response} res - Express response object
   * @returns {Express.Response} - Response object with error details
   */
  _handleError(error, res) {
    const statusCode = error.statusCode || 500;
    const code = error.code || 'INTERNAL_SERVER_ERROR';
    const description = error.message || 'An unexpected error occurred';

    console.error(`[RefundController] Error: ${code} - ${description}`);

    return res.status(statusCode).json({
      error: {
        code,
        description
      }
    });
  }

  /**
   * Create a validation error object
   * @private
   * @param {string} code - Error code
   * @param {string} description - Error description
   * @returns {Error} - Validation error
   */
  _createValidationError(code, description) {
    const error = new Error(description);
    error.code = code;
    error.statusCode = 400;
    return error;
  }
}

module.exports = RefundController;
