# Perl to Node.js Migration - Design

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Express App                        │
├─────────────────────────────────────────────────────┤
│  Routes Layer        │  Middleware                   │
│  - order.routes.js   │  - JSON body parser           │
│  - shipping.routes.js│  - Error handler              │
│                      │  - Input validation           │
├─────────────────────────────────────────────────────┤
│  Service Layer (Business Logic)                      │
│  - order.service.js    ← Order.pm                   │
│  - shipping.service.js ← Shipping.pm                │
├─────────────────────────────────────────────────────┤
│  Data Access Layer                                   │
│  - Knex query builder (replaces DBI)                │
│  - mysql2 driver                                     │
└─────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **Knex over raw SQL**: Provides parameterized queries, migration support, and cross-DB compatibility
2. **Service classes over functions**: Maintains state (items, customer) like Perl objects
3. **Async/await over callbacks**: Cleaner error handling, matches Perl's synchronous flow
4. **Jest for testing**: Industry standard, good mocking support for DB layer
5. **Express over Fastify**: Wider ecosystem, easier for team familiar with CGI patterns
