/**
 * Order Routes - Migrated from Perl CGI order_api.pl
 * 
 * Migration Notes:
 * - CGI path matching → Express router
 * - $ENV{REQUEST_METHOD} → Express method handlers
 * - CGI::header(-status => '400') → res.status(400).json()
 * - decode_json($cgi->param('POSTDATA')) → req.body (Express JSON middleware)
 * - DBI->connect → Knex instance injected via middleware
 */

const express = require('express');
const OrderService = require('../services/order.service');
const ShippingService = require('../services/shipping.service');

const router = express.Router();

/**
 * POST /orders - Create a new order
 * Perl equivalent: create_order() in order_api.pl
 */
router.post('/orders', async (req, res) => {
  try {
    const { customer_id, items } = req.body;
    const db = req.app.get('db');

    const order = new OrderService(db);
    order.customer = { id: customer_id };

    // Add items
    for (const item of items || []) {
      const result = await order.addItem({
        productId: item.product_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
    }

    // Process order
    const result = await order.processOrder();

    if (result.success) {
      return res.status(201).json(result);
    } else {
      return res.status(400).json({ error: result.error });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /orders/:id - Get order by ID
 * Perl equivalent: get_order() in order_api.pl
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const db = req.app.get('db');
    const order = await db('orders').where('id', req.params.id).first();

    if (order) {
      return res.json(order);
    } else {
      return res.status(404).json({ error: 'Order not found' });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /orders/:id/status - Update order status
 * Perl equivalent: update_order_status() in order_api.pl
 */
router.put('/orders/:id/status', async (req, res) => {
  try {
    const db = req.app.get('db');
    const { status } = req.body;

    // Load current status
    const existing = await db('orders').where('id', req.params.id).select('status').first();

    if (!existing) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = new OrderService(db);
    order.orderId = parseInt(req.params.id);
    order.status = existing.status;

    const result = await order.updateStatus(status);

    if (result.success) {
      await db('orders').where('id', req.params.id).update({ status });
      return res.json(result);
    } else {
      return res.status(400).json({ error: result.error });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * POST /shipping/calculate - Calculate shipping cost
 * Perl equivalent: calculate_shipping() in order_api.pl
 */
router.post('/shipping/calculate', (req, res) => {
  try {
    const shipping = new ShippingService({ originPincode: '400001' });
    const result = shipping.calculateShipping({
      destinationPincode: req.body.destination_pincode,
      weightKg: req.body.weight_kg,
      orderValue: req.body.order_value,
      express: req.body.express || false,
      fragile: req.body.fragile || false,
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
