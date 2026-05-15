/**
 * Order Service Tests - Behavioral Parity Validation
 * 
 * These tests ensure the migrated Node.js code produces identical
 * results to the original Perl Order.pm module.
 * 
 * Each test documents the original Perl behavior being validated.
 */

const OrderService = require('../src/services/order.service');

// Mock database (replaces DBI)
const createMockDb = (overrides = {}) => {
  const mockQuery = {
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue([1001]),
    increment: jest.fn().mockResolvedValue(1),
    decrement: jest.fn().mockResolvedValue(1),
  };

  const db = jest.fn(() => ({ ...mockQuery, ...overrides }));
  return db;
};

describe('OrderService - Discount Calculation', () => {
  test('no discount for orders ≤ ₹2000', async () => {
    const db = createMockDb();
    db.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ count: 0 }),
    }));

    const order = new OrderService(db);
    order.customer = { id: 1 };
    order.items = [{ productId: 'P1', price: 500, quantity: 2 }];

    const result = await order.calculateTotal();
    
    expect(parseFloat(result.subtotal)).toBe(1000);
    expect(result.discountPct).toBe(0);
    expect(parseFloat(result.total)).toBe(1180);
  });

  test('5% discount for orders > ₹2000', async () => {
    const db = createMockDb();
    db.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ count: 0 }),
    }));

    const order = new OrderService(db);
    order.customer = { id: 1 };
    order.items = [{ productId: 'P1', price: 3000, quantity: 1 }];

    const result = await order.calculateTotal();
    
    expect(result.discountPct).toBe(5);
    const discounted = 3000 * 0.95;
    expect(parseFloat(result.total)).toBeCloseTo(discounted * 1.18, 2);
  });

  test('10% discount for orders > ₹5000', async () => {
    const db = createMockDb();
    db.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ count: 0 }),
    }));

    const order = new OrderService(db);
    order.customer = { id: 1 };
    order.items = [{ productId: 'P1', price: 6000, quantity: 1 }];

    const result = await order.calculateTotal();
    
    expect(result.discountPct).toBe(10);
    const discounted = 6000 * 0.90;
    expect(parseFloat(result.total)).toBeCloseTo(discounted * 1.18, 2);
  });

  test('15% discount for orders > ₹10000', async () => {
    const db = createMockDb();
    db.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ count: 0 }),
    }));

    const order = new OrderService(db);
    order.customer = { id: 1 };
    order.items = [{ productId: 'P1', price: 15000, quantity: 1 }];

    const result = await order.calculateTotal();
    
    expect(result.discountPct).toBe(15);
  });

  test('loyalty discount of 3% for repeat customers (>5 orders)', async () => {
    const db = createMockDb();
    db.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ count: 10 }),
    }));

    const order = new OrderService(db);
    order.customer = { id: 1 };
    order.items = [{ productId: 'P1', price: 6000, quantity: 1 }];

    const result = await order.calculateTotal();
    
    expect(result.discountPct).toBe(13);
  });

  test('empty items results in zero total', async () => {
    const db = createMockDb();
    db.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ count: 0 }),
    }));

    const order = new OrderService(db);
    order.customer = { id: 1 };
    order.items = [];

    const result = await order.calculateTotal();
    
    expect(parseFloat(result.subtotal)).toBe(0);
    expect(parseFloat(result.total)).toBe(0);
  });
});

describe('OrderService - Status Transitions (State Machine)', () => {
  test('pending → confirmed is valid', async () => {
    const db = createMockDb();
    db.mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue([1]),
    }));

    const order = new OrderService(db);
    order.status = 'pending';
    order.orderId = 1;

    const result = await order.updateStatus('confirmed');
    expect(result.success).toBe(true);
    expect(result.status).toBe('confirmed');
  });

  test('pending → shipped is INVALID', async () => {
    const order = new OrderService(createMockDb());
    order.status = 'pending';

    const result = await order.updateStatus('shipped');
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot transition from 'pending' to 'shipped'");
  });

  test('delivered → anything is INVALID (terminal state)', async () => {
    const order = new OrderService(createMockDb());
    order.status = 'delivered';

    const result = await order.updateStatus('cancelled');
    expect(result.success).toBe(false);
  });

  test('cancelling confirmed order triggers restocking', async () => {
    const mockIncrement = jest.fn().mockResolvedValue(1);
    const db = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue([1]),
      increment: mockIncrement,
    }));

    const order = new OrderService(db);
    order.status = 'confirmed';
    order.orderId = 1;
    order.items = [
      { productId: 'P1', quantity: 5 },
      { productId: 'P2', quantity: 3 },
    ];

    await order.updateStatus('cancelled');

    expect(mockIncrement).toHaveBeenCalledTimes(2);
    expect(mockIncrement).toHaveBeenCalledWith('quantity_available', 5);
    expect(mockIncrement).toHaveBeenCalledWith('quantity_available', 3);
  });
});

describe('OrderService - Item Validation', () => {
  test('throws on missing product_id', async () => {
    const order = new OrderService(createMockDb());
    await expect(order.addItem({ price: 100, quantity: 1 }))
      .rejects.toThrow('Item must have a product_id');
  });

  test('throws on invalid price', async () => {
    const order = new OrderService(createMockDb());
    await expect(order.addItem({ productId: 'P1', price: 0, quantity: 1 }))
      .rejects.toThrow('Item must have a price');
  });

  test('returns error when inventory insufficient', async () => {
    const db = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ quantity_available: 2 }),
    }));

    const order = new OrderService(db);
    const result = await order.addItem({ productId: 'P1', price: 100, quantity: 5 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient inventory. Available: 2');
  });
});

describe('OrderService - Process Order', () => {
  test('fails with no items', async () => {
    const order = new OrderService(createMockDb());
    order.customer = { id: 1 };

    const result = await order.processOrder();
    expect(result.success).toBe(false);
    expect(result.error).toBe('No items in order');
  });

  test('fails for blacklisted customer', async () => {
    const db = jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ is_blacklisted: 1 }),
    }));

    const order = new OrderService(db);
    order.customer = { id: 1 };
    order.items = [{ productId: 'P1', price: 100, quantity: 1 }];

    const result = await order.processOrder();
    expect(result.success).toBe(false);
    expect(result.error).toBe('Customer account suspended');
  });
});
