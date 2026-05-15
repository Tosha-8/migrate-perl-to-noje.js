/**
 * Shipping Service - Migrated from Perl Shipping.pm
 * 
 * Migration Notes:
 * - Perl package-level `my %HASH` → module-level const objects
 * - POSIX::ceil → Math.ceil
 * - Perl regex match → JavaScript regex
 * - Perl undef → null
 * 
 * Business Logic Preserved:
 * - Zone-based pricing (local/regional/national/international)
 * - Free shipping thresholds per zone
 * - Weight rounded up to nearest kg
 * - Express surcharge at 50%
 * - Fragile item surcharge ₹100
 * - Bulk discount tiers for B2B
 */

const ZONE_RATES = {
  local:         { base: 40,  perKg: 10,  freeAbove: 500 },
  regional:      { base: 70,  perKg: 20,  freeAbove: 1000 },
  national:      { base: 120, perKg: 35,  freeAbove: 2000 },
  international: { base: 500, perKg: 150, freeAbove: 0 },  // Never free
};

const BASE_DELIVERY_DAYS = {
  local: 2,
  regional: 4,
  national: 7,
  international: 14,
};

class ShippingService {
  constructor({ originPincode = '400001' } = {}) {
    this.originPincode = originPincode;
  }

  /**
   * Calculate shipping cost based on destination and weight
   * Perl equivalent: Shipping::calculate_shipping()
   */
  calculateShipping({ destinationPincode, weightKg = 0, orderValue = 0, express = false, fragile = false }) {
    // Determine zone
    const zone = this._getZone(destinationPincode);

    if (!zone) {
      return { success: false, error: `Invalid destination pincode: ${destinationPincode}` };
    }

    const rates = ZONE_RATES[zone];

    // Check if eligible for free shipping
    if (rates.freeAbove > 0 && orderValue >= rates.freeAbove) {
      return {
        success: true,
        cost: 0,
        zone,
        free: true,
        deliveryDays: this._estimateDelivery(zone, express),
      };
    }

    // Calculate cost
    const weightRounded = Math.ceil(weightKg); // Round up to nearest kg
    let cost = rates.base + (weightRounded * rates.perKg);

    // Express surcharge: 50% extra
    if (express) {
      cost = cost * 1.5;
    }

    // Fragile items surcharge
    if (fragile) {
      cost += 100;
    }

    return {
      success: true,
      cost: cost.toFixed(2),
      zone,
      free: false,
      deliveryDays: this._estimateDelivery(zone, express),
      breakdown: {
        baseCharge: rates.base,
        weightCharge: weightRounded * rates.perKg,
        expressCharge: express ? (cost / 3).toFixed(2) : 0,
        fragileCharge: fragile ? 100 : 0,
      },
    };
  }

  /**
   * Bulk shipping discount for B2B orders
   * Perl equivalent: Shipping::calculate_bulk_discount()
   */
  calculateBulkDiscount({ totalWeightKg = 0, numPackages = 1 }) {
    let discountPct = 0;

    if (totalWeightKg > 100) {
      discountPct = 20;
    } else if (totalWeightKg > 50) {
      discountPct = 15;
    } else if (totalWeightKg > 20) {
      discountPct = 10;
    }

    // Additional discount for multiple packages
    if (numPackages > 10) {
      discountPct += 5;
    }

    return { discountPct };
  }

  // --- Private methods ---

  _estimateDelivery(zone, express) {
    const days = BASE_DELIVERY_DAYS[zone] || 7;
    return express ? Math.ceil(days / 2) : days;
  }

  _getZone(pincode) {
    if (!pincode || !/^\d{6}$/.test(pincode)) return null;

    const pinNum = parseInt(pincode, 10);

    // Local: same city range (Mumbai)
    if (pinNum >= 400001 && pinNum <= 400099) return 'local';

    // Regional: same state (Maharashtra)
    if (pinNum >= 400100 && pinNum <= 445999) return 'regional';

    // National: rest of India
    if (pinNum >= 100000 && pinNum <= 999999) return 'national';

    return null;
  }
}

module.exports = ShippingService;
