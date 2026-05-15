/**
 * Shipping Service Tests - Behavioral Parity Validation
 * 
 * Validates that the Node.js ShippingService produces identical
 * results to the original Perl Shipping.pm module.
 */

const ShippingService = require('../src/services/shipping.service');

describe('ShippingService - Zone Detection', () => {
  const shipping = new ShippingService();

  test('Mumbai pincodes (400001-400099) → local zone', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '400050',
      weightKg: 1,
    });
    expect(result.zone).toBe('local');
  });

  test('Maharashtra pincodes (400100-445999) → regional zone', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '411001',
      weightKg: 1,
    });
    expect(result.zone).toBe('regional');
  });

  test('Rest of India → national zone', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '110001',
      weightKg: 1,
    });
    expect(result.zone).toBe('national');
  });

  test('invalid pincode returns error', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '12345',
      weightKg: 1,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid destination pincode');
  });

  test('null pincode returns error', () => {
    const result = shipping.calculateShipping({
      destinationPincode: null,
      weightKg: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('ShippingService - Cost Calculation', () => {
  const shipping = new ShippingService();

  test('local shipping: base ₹40 + ₹10/kg', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '400050',
      weightKg: 2.3,
    });
    expect(result.success).toBe(true);
    expect(parseFloat(result.cost)).toBe(70);
  });

  test('weight rounds UP to nearest kg (Perl: POSIX::ceil)', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '400050',
      weightKg: 0.1,
    });
    expect(parseFloat(result.cost)).toBe(50);
  });

  test('express adds 50% surcharge', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '400050',
      weightKg: 2,
      express: true,
    });
    expect(parseFloat(result.cost)).toBe(90);
  });

  test('fragile adds ₹100 flat surcharge', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '400050',
      weightKg: 1,
      fragile: true,
    });
    expect(parseFloat(result.cost)).toBe(150);
  });

  test('express + fragile combined', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '400050',
      weightKg: 1,
      express: true,
      fragile: true,
    });
    expect(parseFloat(result.cost)).toBe(175);
  });
});

describe('ShippingService - Free Shipping', () => {
  const shipping = new ShippingService();

  test('local: free shipping for orders ≥ ₹500', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '400050',
      weightKg: 5,
      orderValue: 500,
    });
    expect(result.cost).toBe(0);
    expect(result.free).toBe(true);
  });

  test('regional: free shipping for orders ≥ ₹1000', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '411001',
      weightKg: 5,
      orderValue: 1000,
    });
    expect(result.cost).toBe(0);
    expect(result.free).toBe(true);
  });

  test('national: free shipping for orders ≥ ₹2000', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '110001',
      weightKg: 5,
      orderValue: 2000,
    });
    expect(result.cost).toBe(0);
    expect(result.free).toBe(true);
  });

  test('local: NOT free for orders < ₹500', () => {
    const result = shipping.calculateShipping({
      destinationPincode: '400050',
      weightKg: 1,
      orderValue: 499,
    });
    expect(result.free).toBe(false);
    expect(parseFloat(result.cost)).toBeGreaterThan(0);
  });
});

describe('ShippingService - Delivery Estimates', () => {
  const shipping = new ShippingService();

  test('local delivery: 2 days standard, 1 day express', () => {
    const standard = shipping.calculateShipping({
      destinationPincode: '400050', weightKg: 1,
    });
    const express = shipping.calculateShipping({
      destinationPincode: '400050', weightKg: 1, express: true,
    });
    expect(standard.deliveryDays).toBe(2);
    expect(express.deliveryDays).toBe(1);
  });

  test('national delivery: 7 days standard, 4 days express', () => {
    const standard = shipping.calculateShipping({
      destinationPincode: '110001', weightKg: 1,
    });
    const express = shipping.calculateShipping({
      destinationPincode: '110001', weightKg: 1, express: true,
    });
    expect(standard.deliveryDays).toBe(7);
    expect(express.deliveryDays).toBe(4);
  });
});

describe('ShippingService - Bulk Discount (B2B)', () => {
  const shipping = new ShippingService();

  test('no discount for weight ≤ 20kg', () => {
    const result = shipping.calculateBulkDiscount({ totalWeightKg: 15 });
    expect(result.discountPct).toBe(0);
  });

  test('10% discount for weight > 20kg', () => {
    const result = shipping.calculateBulkDiscount({ totalWeightKg: 25 });
    expect(result.discountPct).toBe(10);
  });

  test('15% discount for weight > 50kg', () => {
    const result = shipping.calculateBulkDiscount({ totalWeightKg: 55 });
    expect(result.discountPct).toBe(15);
  });

  test('20% discount for weight > 100kg', () => {
    const result = shipping.calculateBulkDiscount({ totalWeightKg: 150 });
    expect(result.discountPct).toBe(20);
  });

  test('additional 5% for > 10 packages', () => {
    const result = shipping.calculateBulkDiscount({ totalWeightKg: 55, numPackages: 12 });
    expect(result.discountPct).toBe(20);
  });
});
