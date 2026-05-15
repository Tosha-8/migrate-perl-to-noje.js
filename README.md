# Perl to Node.js Migration — Trade India Order Service

This project demonstrates a migration of a legacy Perl CGI application to a modern Node.js/Express service for the Trade India marketplace.

## Project Structure

```
├── legacy-perl/          # Original Perl source (reference)
│   ├── cgi-bin/          # CGI entry points
│   └── lib/              # Perl modules (Order.pm, Shipping.pm)
├── migrated-nodejs/      # Migrated Node.js application
│   ├── src/
│   │   ├── index.js      # Express app entry point
│   │   ├── routes/       # API route handlers
│   │   └── services/     # Business logic (OrderService, ShippingService)
│   └── tests/            # Jest test suite
```

## Migrated Modules

| Perl Module | Node.js Service | Description |
|---|---|---|
| `Order.pm` | `order.service.js` | Order processing, pricing, discounts, GST, status management |
| `Shipping.pm` | `shipping.service.js` | Zone-based shipping rates, delivery estimates, bulk discounts |

## Key Business Logic

### Order Service
- Tiered discount calculation (5% / 10% / 15% based on subtotal)
- Loyalty discount (3% for repeat customers with >5 orders)
- GST at 18% applied after discounts
- Order status state machine (pending → confirmed → shipped → delivered)
- Inventory validation and credit limit checks

### Shipping Service
- Zone-based pricing (local / regional / national / international)
- Free shipping thresholds per zone
- Express delivery surcharge (50%)
- Fragile item handling (+₹100)
- Bulk B2B discount tiers

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| Database | Knex (query builder) + MySQL2 |
| Testing | Jest |

## Getting Started

```bash
cd migrated-nodejs
npm install
npm start
```

## Running Tests

```bash
cd migrated-nodejs
npm test
```

## Migration Approach

- **Architecture**: Layered (Routes → Services → Data Access)
- **Database access**: All queries via Knex (parameterized, no raw SQL)
- **Async model**: async/await throughout
- **Testing**: Jest tests validate behavioral parity with original Perl logic
- **Naming**: kebab-case files, PascalCase classes, camelCase methods

## Original Perl Dependencies → Node.js Equivalents

| Perl (CPAN) | Node.js (npm) |
|---|---|
| DBI / DBD::mysql | knex + mysql2 |
| CGI.pm | express |
| POSIX (ceil) | Math.ceil |
| List::Util (sum) | Array.reduce |
| JSON | Built-in JSON |
