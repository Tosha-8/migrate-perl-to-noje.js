# Perl to Node.js Migration - Requirements

## Overview
Migrate Trade India's legacy Perl/CGI e-commerce order management system to a modern Node.js/Express architecture while maintaining complete behavioral parity.

## Functional Requirements

### FR-1: Order Management
- Create orders with multiple line items
- Calculate totals with tiered discount logic (5%/10%/15%)
- Apply loyalty discounts for repeat customers (3% for >5 orders)
- Apply GST at 18% after discounts
- Validate inventory before adding items
- Check customer credit limits before processing
- Block blacklisted customers

### FR-2: Order Status Management
- Implement state machine: pending → confirmed → shipped → delivered
- Allow cancellation from pending and confirmed states
- Restock inventory when cancelling confirmed orders
- Log all status transitions

### FR-3: Shipping Calculation
- Zone-based pricing (local/regional/national/international)
- Pincode-based zone detection
- Free shipping thresholds per zone
- Express delivery (50% surcharge, halved delivery time)
- Fragile item surcharge (₹100 flat)
- Bulk discount for B2B orders

### FR-4: API Endpoints
- POST /orders - Create order
- GET /orders/:id - Retrieve order
- PUT /orders/:id/status - Update status
- POST /shipping/calculate - Calculate shipping cost

## Non-Functional Requirements

### NFR-1: Behavioral Parity
- All business logic must produce identical outputs to Perl version
- Edge cases (null/undef, empty arrays, boundary values) must match

### NFR-2: Security
- No hardcoded credentials (use environment variables)
- Parameterized queries only (Knex)
- Input validation on all endpoints

### NFR-3: Testability
- Unit tests for all service methods
- Tests reference original Perl source lines
- >80% code coverage target
