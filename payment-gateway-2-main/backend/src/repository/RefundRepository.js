/**
 * RefundRepository - Data Access Layer
 * Responsible for:
 * - All database queries related to refunds
 * - Payment data retrieval
 * - Idempotency key management
 * 
 * Follows the Repository Pattern to abstract database operations
 * and maintain a single point of database access
 */
class RefundRepository {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get a payment by ID
   * @param {string} paymentId - The payment ID
   * @returns {Promise<Object|null>} - Payment object or null if not found
   */
  async getPaymentById(paymentId) {
    try {
      const result = await this.db.query(
        'SELECT * FROM payments WHERE id = $1',
        [paymentId]
      );
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch payment: ${error.message}`);
    }
  }

  /**
   * Get total refunded amount for a payment
   * Sums all processed or pending refunds for the given payment
   * @param {string} paymentId - The payment ID
   * @returns {Promise<number>} - Total refunded amount
   */
  async getTotalRefundedAmount(paymentId) {
    try {
      const result = await this.db.query(
        "SELECT SUM(amount) as total FROM refunds WHERE payment_id = $1 AND status IN ('processed', 'pending')",
        [paymentId]
      );
      return parseInt(result.rows[0].total || 0, 10);
    } catch (error) {
      throw new Error(`Failed to fetch total refunded amount: ${error.message}`);
    }
  }

  /**
   * Find a refund by idempotency key
   * Returns the existing refund if the same request was already processed
   * @param {string} idempotencyKey - The idempotency key
   * @returns {Promise<Object|null>} - Refund object or null if not found
   */
  async findRefundByIdempotencyKey(idempotencyKey) {
    try {
      const result = await this.db.query(
        'SELECT id, payment_id, amount, status, created_at FROM refunds WHERE idempotency_key = $1 LIMIT 1',
        [idempotencyKey]
      );
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch refund by idempotency key: ${error.message}`);
    }
  }

  /**
   * Create a new refund record in the database
   * @param {Object} refundData - Refund data
   * @param {string} refundData.id - Refund ID
   * @param {string} refundData.paymentId - Payment ID
   * @param {string} refundData.merchantId - Merchant ID
   * @param {number} refundData.amount - Refund amount
   * @param {string} refundData.reason - Refund reason
   * @param {string} refundData.status - Refund status
   * @param {string} [refundData.idempotencyKey] - Idempotency key
   * @returns {Promise<Object>} - Created refund object
   */
  async createRefund(refundData) {
    try {
      const { id, paymentId, merchantId, amount, reason, status, idempotencyKey } = refundData;

      const result = await this.db.query(
        `INSERT INTO refunds (id, payment_id, merchant_id, amount, reason, status, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, payment_id, amount, status, created_at`,
        [id, paymentId, merchantId, amount, reason, status, idempotencyKey]
      );

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to create refund: ${error.message}`);
    }
  }

  /**
   * Get a refund by ID
   * @param {string} refundId - The refund ID
   * @returns {Promise<Object|null>} - Refund object or null if not found
   */
  async getRefundById(refundId) {
    try {
      const result = await this.db.query(
        'SELECT * FROM refunds WHERE id = $1',
        [refundId]
      );
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Failed to fetch refund: ${error.message}`);
    }
  }

  /**
   * Update refund status
   * @param {string} refundId - The refund ID
   * @param {string} status - New status
   * @returns {Promise<Object>} - Updated refund object
   */
  async updateRefundStatus(refundId, status) {
    try {
      const result = await this.db.query(
        'UPDATE refunds SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, refundId]
      );
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to update refund status: ${error.message}`);
    }
  }
}

module.exports = RefundRepository;
