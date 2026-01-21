/**
 * Unit Tests for the Refactored Refund Architecture
 * 
 * Tests demonstrate how to test each layer independently
 * using mocks and dependency injection
 */

const RefundController = require('../controllers/RefundController');
const RefundService = require('../services/RefundService');
const RefundRepository = require('../repository/RefundRepository');

// ============================================================================
// RefundRepository Tests
// ============================================================================

describe('RefundRepository', () => {
  let repository;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    };
    repository = new RefundRepository(mockDb);
  });

  describe('getPaymentById', () => {
    it('should return payment when it exists', async () => {
      const mockPayment = { id: 'pay_123', amount: 5000, status: 'success' };
      mockDb.query.mockResolvedValueOnce({ rows: [mockPayment] });

      const result = await repository.getPaymentById('pay_123');

      expect(result).toEqual(mockPayment);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM payments WHERE id = $1',
        ['pay_123']
      );
    });

    it('should return null when payment does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.getPaymentById('pay_nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(repository.getPaymentById('pay_123')).rejects.toThrow('Failed to fetch payment');
    });
  });

  describe('getTotalRefundedAmount', () => {
    it('should return sum of refunded amounts', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ total: 2000 }] });

      const result = await repository.getTotalRefundedAmount('pay_123');

      expect(result).toBe(2000);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SUM(amount)'),
        ['pay_123']
      );
    });

    it('should return 0 when no refunds exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ total: null }] });

      const result = await repository.getTotalRefundedAmount('pay_123');

      expect(result).toBe(0);
    });
  });

  describe('findRefundByIdempotencyKey', () => {
    it('should return existing refund for idempotency key', async () => {
      const mockRefund = { id: 'rfnd_123', status: 'pending', amount: 1000 };
      mockDb.query.mockResolvedValueOnce({ rows: [mockRefund] });

      const result = await repository.findRefundByIdempotencyKey('key_123');

      expect(result).toEqual(mockRefund);
    });

    it('should return null when idempotency key not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await repository.findRefundByIdempotencyKey('key_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('createRefund', () => {
    it('should create and return refund', async () => {
      const refundData = {
        id: 'rfnd_123',
        paymentId: 'pay_123',
        merchantId: 'merch_123',
        amount: 1000,
        reason: 'Customer requested',
        status: 'pending',
        idempotencyKey: 'key_123'
      };

      const mockCreatedRefund = { id: 'rfnd_123', amount: 1000, status: 'pending' };
      mockDb.query.mockResolvedValueOnce({ rows: [mockCreatedRefund] });

      const result = await repository.createRefund(refundData);

      expect(result).toEqual(mockCreatedRefund);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refunds'),
        expect.any(Array)
      );
    });

    it('should throw error on database failure', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Unique constraint violation'));

      const refundData = {
        id: 'rfnd_123',
        paymentId: 'pay_123',
        merchantId: 'merch_123',
        amount: 1000,
        reason: 'Customer requested',
        status: 'pending'
      };

      await expect(repository.createRefund(refundData)).rejects.toThrow('Failed to create refund');
    });
  });
});

// ============================================================================
// RefundService Tests
// ============================================================================

describe('RefundService', () => {
  let service;
  let mockRepository;
  let mockQueue;

  beforeEach(() => {
    mockRepository = {
      getPaymentById: jest.fn(),
      getTotalRefundedAmount: jest.fn(),
      findRefundByIdempotencyKey: jest.fn(),
      createRefund: jest.fn()
    };

    mockQueue = {
      add: jest.fn()
    };

    service = new RefundService(mockRepository, mockQueue);
  });

  describe('processRefund', () => {
    const mockPayment = {
      id: 'pay_123',
      amount: 5000,
      merchant_id: 'merch_123',
      status: 'success'
    };

    const mockCreatedRefund = {
      id: 'rfnd_123',
      payment_id: 'pay_123',
      amount: 1000,
      status: 'pending'
    };

    it('should return existing refund if idempotency key matches', async () => {
      const existingRefund = { id: 'rfnd_existing', amount: 1000, status: 'pending' };
      mockRepository.findRefundByIdempotencyKey.mockResolvedValueOnce(existingRefund);

      const result = await service.processRefund('pay_123', 1000, 'reason', 'key_123');

      expect(result).toEqual(existingRefund);
      expect(mockRepository.createRefund).not.toHaveBeenCalled();
    });

    it('should process refund successfully for valid payment', async () => {
      mockRepository.findRefundByIdempotencyKey.mockResolvedValueOnce(null);
      mockRepository.getPaymentById.mockResolvedValueOnce(mockPayment);
      mockRepository.getTotalRefundedAmount.mockResolvedValueOnce(0);
      mockRepository.createRefund.mockResolvedValueOnce(mockCreatedRefund);
      mockQueue.add.mockResolvedValueOnce({});

      const result = await service.processRefund('pay_123', 1000, 'reason', 'key_123');

      expect(result).toEqual(mockCreatedRefund);
      expect(mockRepository.createRefund).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith('process-refund', { refundId: 'rfnd_123' });
    });

    it('should throw error if payment not found', async () => {
      mockRepository.findRefundByIdempotencyKey.mockResolvedValueOnce(null);
      mockRepository.getPaymentById.mockResolvedValueOnce(null);

      await expect(
        service.processRefund('pay_nonexistent', 1000, 'reason')
      ).rejects.toThrow('Payment not found');

      expect(mockRepository.createRefund).not.toHaveBeenCalled();
    });

    it('should throw error if payment is not in success status', async () => {
      mockRepository.findRefundByIdempotencyKey.mockResolvedValueOnce(null);
      mockRepository.getPaymentById.mockResolvedValueOnce({
        ...mockPayment,
        status: 'failed'
      });

      await expect(
        service.processRefund('pay_123', 1000, 'reason')
      ).rejects.toThrow('Payment not in refundable state');
    });

    it('should throw error if refund exceeds available amount', async () => {
      mockRepository.findRefundByIdempotencyKey.mockResolvedValueOnce(null);
      mockRepository.getPaymentById.mockResolvedValueOnce(mockPayment);
      mockRepository.getTotalRefundedAmount.mockResolvedValueOnce(4000);

      await expect(
        service.processRefund('pay_123', 2000, 'reason')
      ).rejects.toThrow('Refund amount exceeds available amount');
    });

    it('should throw error if refund amount is zero or negative', async () => {
      mockRepository.findRefundByIdempotencyKey.mockResolvedValueOnce(null);
      mockRepository.getPaymentById.mockResolvedValueOnce(mockPayment);
      mockRepository.getTotalRefundedAmount.mockResolvedValueOnce(0);

      await expect(
        service.processRefund('pay_123', -100, 'reason')
      ).rejects.toThrow('Refund amount must be greater than 0');

      await expect(
        service.processRefund('pay_123', 0, 'reason')
      ).rejects.toThrow('Refund amount must be greater than 0');
    });

    it('should support full refund', async () => {
      mockRepository.findRefundByIdempotencyKey.mockResolvedValueOnce(null);
      mockRepository.getPaymentById.mockResolvedValueOnce(mockPayment);
      mockRepository.getTotalRefundedAmount.mockResolvedValueOnce(0);
      mockRepository.createRefund.mockResolvedValueOnce({
        ...mockCreatedRefund,
        amount: 5000
      });
      mockQueue.add.mockResolvedValueOnce({});

      const result = await service.processRefund('pay_123', 5000, 'reason');

      expect(result.amount).toBe(5000);
      expect(mockRepository.createRefund).toHaveBeenCalled();
    });

    it('should support partial refunds up to payment amount', async () => {
      mockRepository.findRefundByIdempotencyKey.mockResolvedValueOnce(null);
      mockRepository.getPaymentById.mockResolvedValueOnce(mockPayment);
      mockRepository.getTotalRefundedAmount.mockResolvedValueOnce(2000);
      mockRepository.createRefund.mockResolvedValueOnce({
        ...mockCreatedRefund,
        amount: 3000
      });
      mockQueue.add.mockResolvedValueOnce({});

      const result = await service.processRefund('pay_123', 3000, 'reason');

      expect(result.amount).toBe(3000);
      expect(mockRepository.createRefund).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// RefundController Tests
// ============================================================================

describe('RefundController', () => {
  let controller;
  let mockService;
  let req;
  let res;

  beforeEach(() => {
    mockService = {
      processRefund: jest.fn()
    };

    controller = new RefundController(mockService);

    req = {
      params: { payment_id: 'pay_123' },
      body: {
        amount: 1000,
        reason: 'Customer requested',
        idempotencyKey: 'key_123'
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('createRefund', () => {
    it('should return 201 with refund data on success', async () => {
      const mockRefund = {
        id: 'rfnd_123',
        payment_id: 'pay_123',
        amount: 1000,
        status: 'pending',
        created_at: '2026-01-16T10:30:00Z'
      };

      mockService.processRefund.mockResolvedValueOnce(mockRefund);

      await controller.createRefund(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        id: 'rfnd_123',
        payment_id: 'pay_123',
        amount: 1000,
        status: 'pending',
        created_at: '2026-01-16T10:30:00Z'
      });
    });

    it('should return 400 on validation error', async () => {
      req.body.amount = -100;

      await controller.createRefund(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'INVALID_AMOUNT',
          description: 'Refund amount must be a positive number'
        }
      });
    });

    it('should return 400 when amount is missing', async () => {
      delete req.body.amount;

      await controller.createRefund(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: 'MISSING_AMOUNT'
        })
      });
    });

    it('should return 400 when reason is missing', async () => {
      delete req.body.reason;

      await controller.createRefund(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: 'MISSING_REASON'
        })
      });
    });

    it('should return 404 on payment not found error', async () => {
      const error = new Error('Payment not found');
      error.code = 'PAYMENT_NOT_FOUND';
      error.statusCode = 404;

      mockService.processRefund.mockRejectedValueOnce(error);

      await controller.createRefund(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'PAYMENT_NOT_FOUND',
          description: 'Payment not found'
        }
      });
    });

    it('should return 500 on unexpected error', async () => {
      mockService.processRefund.mockRejectedValueOnce(new Error('Unexpected error'));

      await controller.createRefund(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: expect.objectContaining({
          code: 'INTERNAL_SERVER_ERROR'
        })
      });
    });

    it('should pass idempotency key to service', async () => {
      mockService.processRefund.mockResolvedValueOnce({
        id: 'rfnd_123',
        payment_id: 'pay_123',
        amount: 1000,
        status: 'pending'
      });

      await controller.createRefund(req, res);

      expect(mockService.processRefund).toHaveBeenCalledWith(
        'pay_123',
        1000,
        'Customer requested',
        'key_123'
      );
    });
  });
});

/**
 * To run these tests:
 * 
 * npm install --save-dev jest
 * 
 * Add to package.json:
 * "scripts": {
 *   "test": "jest",
 *   "test:watch": "jest --watch",
 *   "test:coverage": "jest --coverage"
 * }
 * 
 * Run tests:
 * npm test
 */
