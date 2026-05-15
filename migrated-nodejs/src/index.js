/**
 * Trade India Order Service - Entry Point
 * Migrated from Perl CGI (order_api.pl) to Express
 */

const express = require('express');
const orderRoutes = require('./routes/order.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware (replaces CGI body parsing)
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tradeindia-order-service', version: '1.0.0' });
});

// Routes
app.use('/api', orderRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server (only if not in test mode)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Trade India Order Service running on port ${PORT}`);
  });
}

module.exports = app;
