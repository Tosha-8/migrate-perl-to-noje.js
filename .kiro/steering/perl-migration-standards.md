---
inclusion: always
---

# Perl to Node.js Migration Standards

## Module Mapping (CPAN → npm)

| Perl Module | Node.js Equivalent | Notes |
|---|---|---|
| DBI / DBD::mysql | knex + mysql2 | Use Knex query builder, never raw SQL strings |
| CGI.pm | express | Express with body-parser middleware |
| JSON | built-in JSON | No external dependency needed |
| POSIX (strftime) | date-fns or built-in Date | Prefer date-fns for formatting |
| POSIX (ceil/floor) | Math.ceil / Math.floor | Built-in |
| List::Util (sum, max) | Array.reduce / Math.max | Built-in |
| LWP::UserAgent | axios or node-fetch | Use axios for HTTP clients |
| File::Path | fs/promises + path | Built-in Node.js modules |
| Carp (croak/confess) | throw new Error() | Use custom error classes for domains |
| Try::Tiny | try/catch | Native JavaScript |

## Code Conversion Rules

1. **Perl hashes → JavaScript objects**: `$hash->{key}` → `obj.key`
2. **Perl arrays → JavaScript arrays**: `@array` → `array`, `$#array` → `array.length - 1`
3. **Perl regex**: Mostly compatible, watch for `/s` and `/x` modifiers
4. **Perl undef → null/undefined**: Use nullish coalescing (`??`) and optional chaining (`?.`)
5. **Perl die → throw**: Use typed Error classes
6. **Perl bless → class**: Use ES6 classes
7. **Perl sprintf("%.2f") → toFixed(2)**: For currency formatting
8. **Perl unless → if (!...)**: Invert the condition
9. **Perl map/grep → Array.map/filter**: Direct equivalents

## Architecture Standards

- Use layered architecture: Routes → Services → Data Access
- All database access through Knex (parameterized queries)
- Async/await everywhere (never callbacks)
- Input validation at route level using express-validator or joi
- Error handling via Express error middleware
- Environment config via dotenv (never hardcode credentials)

## Testing Requirements

- Every migrated module MUST have corresponding Jest tests
- Tests must validate behavioral parity with original Perl logic
- Include comments referencing original Perl file and line numbers
- Test edge cases: undef/null handling, empty arrays, boundary values
- Mock database layer for unit tests

## Naming Conventions

- Files: kebab-case (order.service.js, shipping.routes.js)
- Classes: PascalCase (OrderService, ShippingService)
- Methods: camelCase (calculateTotal, addItem)
- Constants: UPPER_SNAKE_CASE (ZONE_RATES, MAX_RETRY)
- Database columns: snake_case (preserved from Perl/MySQL)
