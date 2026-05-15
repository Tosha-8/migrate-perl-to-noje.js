/**
 * Order Service - Migrated from Perl Order.pm
 * 
 * Migration Notes:
 * - Perl hash refs → JavaScript objects
 * - DBI queries → Knex query builder (parameterized)
 * - die/eval → throw/try-catch
 * - Perl's sprintf("%.2f") → toFixed(2)
 * - Perl's undef → null/undefined handling
 * 
 * Business Logic Preserved:
 * - Tiered discount calculation (5%/10%/15% based on subtotal)
 * - Loyalty discount (3% for customers with >5 orders)
 * - GST at 18% applied after discounts
 * - Status transition validation (state machine)
 * - Inventory check before adding items
 * - Credit limit validation before processing
 * - Blacklist check
 * - Restocking on cancellation of confirmed orders
 */

class OrderService {
  constructor(db) {
    this.db = db;
    this.items = [];
    this.status = 'pending';
    this.customer = {};
    this.orderId = null;
  }

  /**
   * Calculate order total with tiered discounts and GST
   * 
   * Business Rules (from Perl Order.pm line 28-55):
   *   - Orders > ₹10,000 → 15% discount
   *   - Orders > ₹5,000  → 10% discount
   *   - Orders > ₹2,000  → 5% discount
   *   - Repeat customers (>5 orders) → additional 3% loyalty discount
   *   - GST applied AFTER discounts at 18%
   */
  async calculateTotal() {
    const subtotal = this.items.reduce(
      (sum, item) => sum + item.price * item.quantity, 
      0
    );

    // Tiered discount
    let discountPct = 0;
    if (subtotal > 10000) {
      discountPct = 15;
    } else if (subtotal > 5000) {
      discountPct = 10;
    } else if (subtotal > 2000) {
      discountPct = 5;
    }

    // Loyalty discount for repeat customers
    const orderCount = await this._getCustomerOrderCount();
    const loyaltyDiscount = orderCount > 5 ? 3 : 0;

    const totalDiscount = discountPct + loyaltyDiscount;
    const discounted = subtotal * (1 - totalDiscount / 100);

    // GST at 18%
    const gst = discounted * 0.18;
    const total = discounted + gst;

    return {
      subtotal: subtotal.toFixed(2),
      discountPct: totalDiscount,
      discountAmt: (subtotal - discounted).toFixed(2),
      gst: gst.toFixed(2),
      total: total.toFixed(2),
    };
  }

  /**
   * Add item with inventory validation
   * Perl equivalent: Order::add_item()
   */
  async addItem({ productId, name, price, quantity }) {
    // Validate required fields (Perl: die "Item must have...")
    if (!productId) throw new Error('Item must have a product_id');
    if (!price || price <= 0) throw new Error('Item must have a price');
    if (!quantity || quantity <= 0) throw new Error('Item must have a quantity');

    // Check inventory
    const available = await this._checkInventory(productId);
    if (available < quantity) {
      return { success: false, error: `Insufficient inventory. Available: ${available}` };
    }

    this.items.push({
      productId,
      name: name || 'Unknown Product',
      price,
      quantity,
    });

    return { success: true };
  }

  /**
   * Process order - validates, saves, sends notification
   * Perl equivalent: Order::process_order()
   */
  async processOrder() {
    // Validation
    if (this.items.length === 0) {
      return { success: false, error: 'No items in order' };
    }

    if (!this.customer.id) {
      return { success: false, error: 'Customer information required' };
    }

    // Blacklist check
    if (await this._isCustomerBlacklisted(this.customer.id)) {
      return { success: false, error: 'Customer account suspended' };
    }

    const totals = await this.calculateTotal();

    // Credit limit check
    const creditLimit = await this._getCreditLimit(this.customer.id);
    if (parseFloat(totals.total) > creditLimit) {
      return { success: false, error: 'Order exceeds credit limit' };
    }

    // Save to database
    const orderId = await this._saveOrder(totals);

    // Update inventory
    await this._deductInventory();

    // Send notification
    await this._sendOrderNotification(orderId);

    this.orderId = orderId;
    this.status = 'confirmed';

    return {
      success: true,
      orderId,
      totals,
      status: 'confirmed',
    };
  }

  /**
   * Status transition with validation (state machine)
   * 
   * Valid transitions:
   *   pending   → confirmed, cancelled
   *   confirmed → shipped, cancelled (with restocking)
   *   shipped   → delivered
   *   delivered → (terminal)
   *   cancelled → (terminal)
   */
  async updateStatus(newStatus) {
    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: [],
      cancelled: [],
    };

    const allowed = validTransitions[this.status] || [];

    if (!allowed.includes(newStatus)) {
      return {
        success: false,
        error: `Cannot transition from '${this.status}' to '${newStatus}'`,
      };
    }

    // If cancelling a confirmed order, restock items
    if (newStatus === 'cancelled' && this.status === 'confirmed') {
      await this._restockItems();
    }

    const previousStatus = this.status;
    this.status = newStatus;
    await this._logStatusChange(previousStatus, newStatus);

    return { success: true, status: newStatus };
  }

  // --- Private methods (Perl _ prefix convention preserved) ---

  async _getCustomerOrderCount() {
    if (!this.customer.id) return 0;
    const result = await this.db('orders')
      .where('customer_id', this.customer.id)
      .count('* as count')
      .first();
    return result?.count || 0;
  }

  async _checkInventory(productId) {
    const result = await this.db('inventory')
      .where('product_id', productId)
      .select('quantity_available')
      .first();
    return result?.quantity_available || 0;
  }

  async _isCustomerBlacklisted(customerId) {
    const result = await this.db('customers')
      .where('id', customerId)
      .select('is_blacklisted')
      .first();
    return !!result?.is_blacklisted;
  }

  async _getCreditLimit(customerId) {
    const result = await this.db('customers')
      .where('id', customerId)
      .select('credit_limit')
      .first();
    return result?.credit_limit || 50000; // Default 50000 INR
  }

  async _saveOrder(totals) {
    const [orderId] = await this.db('orders').insert({
      customer_id: this.customer.id,
      subtotal: totals.subtotal,
      discount: totals.discountAmt,
      gst: totals.gst,
      total: totals.total,
      status: 'confirmed',
      created_at: new Date(),
    });
    return orderId;
  }

  async _deductInventory() {
    for (const item of this.items) {
      await this.db('inventory')
        .where('product_id', item.productId)
        .decrement('quantity_available', item.quantity);
    }
  }

  async _restockItems() {
    for (const item of this.items) {
      await this.db('inventory')
        .where('product_id', item.productId)
        .increment('quantity_available', item.quantity);
    }
  }

  async _sendOrderNotification(orderId) {
    // TODO: Integrate with notification service (email/SMS)
    // Original Perl just returned 1
    return true;
  }

  async _logStatusChange(fromStatus, toStatus) {
    await this.db('order_status_log').insert({
      order_id: this.orderId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_at: new Date(),
    });
  }
}

module.exports = OrderService;
