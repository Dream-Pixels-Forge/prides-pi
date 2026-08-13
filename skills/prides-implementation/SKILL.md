---
name: prides-implementation
description: >
  Mandatory implementation skill for PRIDES — enforces vertical slice architecture
  and strict test-driven development (TDD). Every feature is built as a vertical
  slice and every production line is preceded by a failing test. Use when entering
  the Implement phase or when the user says "build", "implement", "code", "develop",
  or needs TDD enforcement.
license: MIT
compatibility: Requires the pi-prides extension loaded (provides the prides_* tools).
metadata:
  author: Dream-Pixels-Forge
  version: "1.0"
---

# PRIDES Implementation

Vertical slice architecture + strict TDD, enforced through PRIDES quality gates.

## When This Skill Activates

- "build X", "implement X", "code X", "develop X"
- "write tests first", "TDD", "test-driven"
- Entering the Implement phase
- Any task that touches production code

---

## Mandatory Principles

### 1. Vertical Slice Architecture (Non-Negotiable)

Organize every feature as a **self-contained vertical slice** — from entry point to persistence — rather than splitting code across technical layers.

**Vertical slice folder structure:**

```
src/features/
├── create-order/
│   ├── create-order.endpoint.ts
│   ├── create-order.handler.ts
│   ├── create-order.request.ts
│   ├── create-order.validator.ts
│   ├── create-order.response.ts
│   ├── create-order.repository.ts
│   └── create-order.test.ts
├── cancel-order/
│   ├── cancel-order.endpoint.ts
│   ├── cancel-order.handler.ts
│   ├── cancel-order.request.ts
│   ├── cancel-order.validator.ts
│   ├── cancel-order.response.ts
│   ├── cancel-order.repository.ts
│   └── cancel-order.test.ts
└── list-orders/
    └── ...
```

**Why vertical slices:**

| Anti-pattern (horizontal) | Vertical slice |
|---------------------------|----------------|
| `controllers/` folder | `features/create-order/` |
| `services/` folder | `features/create-order/create-order.handler.ts` |
| `repositories/` folder | `features/create-order/create-order.repository.ts` |
| Feature scattered across 5+ folders | Feature isolated in one slice |
| Cross-cutting coupling | Slice owns its full stack |

**Rules:**

- Each slice is named after a use case: `create-<thing>`, `update-<thing>`, `delete-<thing>`, `list-<thing>`
- A slice contains everything required to deliver that behavior: request, validation, handler, response, data access
- Slices may share domain types in a `src/common/` or `src/domain/` folder, but never share handler/service/repository logic
- Adding a new feature = adding a new slice, never modifying existing slice internals
- Slices must be **parallelizable** — no dependencies between slices. Each slice is a tracer bullet an agent can grab independently.

**Matt Pocock's tracer-bullet principle:**

> "Tracer bullets are thin, vertical slices an agent can grab independently."
> — Matt Pocock, *Full Walkthrough: Workflow for AI Coding* (Google Cloud Tech, 2026-04-24)

Each slice must:
- Deliver one narrow, end-to-end behavior
- Be independently verifiable
- Have no dependencies on other slices (prefer no dependencies for the first parallel pass)
- Be sized so an agent can implement it in one focused session

**Sources:**

- Jimmy Bogard: [Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/) (2026)
- Milan Jovanović: [Vertical Slice Architecture in .NET](https://milanjovanovic.tech/blog/vertical-slice-architecture-dotnet) (Apr 2026)
- Anton DevTips: [How to Structure Production Apps with VSA in 2026](https://antondevtips.com/blog/how-to-structure-production-apps-with-vertical-slice-architecture-in-dotnet-in-2026) (Jun 2026)
- Chanh Le: [Vertical Slice Architecture Guide](https://chanhle.dev/en/blog/vertical-slice-architecture-guide) (Mar 2026)
- Dieste et al.: [The role of slicing in test-driven development](https://arxiv.org/abs/2407.13258) (UPM, 2024)
- Matt Pocock: [Full Walkthrough: Workflow for AI Coding](https://www.youtube.com/watch?v=-QFHIoCo-Ko) — tracer-bullet vertical slices (Apr 2026)
- Matt Pocock: [skills/tdd](https://github.com/mattpocock/skills/blob/main/tdd/SKILL.md) — vertical slices via tracer bullets
- Matt Pocock: [skills/prd-to-issues](https://github.com/mattpocock/skills/blob/main/prd-to-issues/SKILL.md) — breaking PRDs into vertical tracer-bullet issues

---

### 2. Test-Driven Development (Non-Negotiable)

**The Iron Law:**

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? Delete it. Start over. No exceptions.

**RED-GREEN cycle (Matt Pocock, June 2026):**

| Phase | Action | Rule |
|-------|--------|------|
| **RED** | Write ONE failing test for ONE behavior | Must fail for the expected reason |
| **GREEN** | Write MINIMAL code to pass that test | No refactoring, no extra features |

> Refactoring is not part of the implementation loop. Matt Pocock dropped REFACTOR from the loop in June 2026 because agents essentially never performed it reliably. Refactoring belongs to the review stage (`prides-review`), not the red → green implementation cycle.

**Matt Pocock's rules of the loop (mandatory):**

From [mattpocock/skills/tdd](https://github.com/mattpocock/skills/blob/main/tdd/SKILL.md):

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to the review stage, not the red → green implementation cycle. (Matt dropped REFACTOR from the loop in June 2026 because agents essentially never performed it reliably.)

**Vertical slice TDD pattern (tracer bullets):**

```
Cycle 1:  RED  → test for "valid request creates entity" (tracer bullet)
          GREEN → minimal handler + repository

Cycle 2:  RED  → test for "invalid request returns validation error"
          GREEN → add validator

Cycle 3:  RED  → test for "duplicate entity returns conflict"
          GREEN → add uniqueness check

...one seam at a time, one slice at a time.
```

Each test is a **tracer bullet**: it responds to what the last cycle taught you. The first cycle proves a single path end to end.

**TDD anti-patterns (FORBIDDEN):**

- Horizontal slicing: writing all tests first, then all implementation
- Testing implementation details: test public behavior only
- Mocking internal collaborators: mock external boundaries only
- Private method testing: make it public or extract it
- Test bulk-writing: one test at a time, respond to what you learn
- Keeping code as "reference" before writing tests: delete means delete
- Tautological assertions: expected values must come from an independent source of truth — a known-good literal, a worked example, the spec — not recomputed the way the code computes them

**Test naming rules (from Matt Pocock):**

- Test names must read as **capabilities**, not as internals
- Good: `user can checkout with valid cart`
- Bad: `checkout calls paymentService.process then deductInventory`

**Sources:**

- Beck, K.: *Test-Driven Development by Example* (2002)
- Fowler, M.: [Test Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)
- Dieste et al.: [The role of slicing in test-driven development](https://arxiv.org/abs/2407.13258) (UPM, 2024)
- Matt Pocock: [tdd/SKILL.md](https://github.com/mattpocock/skills/blob/main/tdd/SKILL.md) — vertical slices, tracer bullets, June 2026
- Matt Pocock: [prd-to-issues/SKILL.md](https://github.com/mattpocock/skills/blob/main/prd-to-issues/SKILL.md) — tracer-bullet vertical slices for issue breakdown
- Matt Pocock: [The /tdd Skill](https://www.aihero.dev/skills-test-driven-development-claude-code) — red-green, vertical slice, no refactor in loop

---

## PRIDES Integration

This skill runs inside the **Implement (I)** phase. Before writing any code:

1. Call `prides_status` — confirm phase is **I (Implement)** and no emergency stop is active.
2. Call `prides_task_add` for each slice you plan to build.
3. Call `prides_gate test-unit` to confirm the test runner is configured.

### Phase gates (Implement)

| Gate | Command | What it checks |
|------|---------|----------------|
| `test-unit` | `prides_gate test-unit` | All unit tests pass |
| `linter` | `prides_gate linter` | Biome lint passes |
| `typecheck` | `prides_gate typecheck` | TypeScript typecheck passes |

### TDD enforcement through PRIDES

Every slice must pass these checks before the phase can advance:

- [ ] For every slice file, a corresponding test file exists and **failed first**
- [ ] The test runner shows `pass` for all tests
- [ ] No production code exists without a test that preceded it
- [ ] Linter passes
- [ ] Typecheck passes

If any gate fails, loop with `prides-gate-loop`:

```
prides_gates
prides_gate <name>   # re-run specific failing gate
prides_phase_advance # only when ALL gates pass
```

---

## Workflow: Building One Vertical Slice with TDD

### Step 1 — Identify the slice

Determine the use case:

- "Create order" → slice `features/create-order/`
- "Cancel subscription" → slice `features/cancel-subscription/`
- "List products" → slice `features/list-products/`

Add the task to PRIDES:

```
prides_task_add description="Implement slice: create-order"
```

### Step 2 — Write the RED test

Write ONE test that describes ONE behavior of the slice.

**Good test:**

```typescript
test('valid request creates order with calculated total', async () => {
  const result = await createOrder.execute({
    customerId: 'cust-1',
    items: [{ productId: 'prod-1', quantity: 2, price: 10 }]
  });

  expect(result.isSuccess).toBe(true);
  expect(result.value.total).toBe(20);
});
```

**Bad test:**

```typescript
test('create order calls handler then saves to repository', async () => {
  mockRepository.save.mockResolvedValue({ id: 'order-1' });
  const result = await createOrder.execute(mockRequest);
  expect(result.isSuccess).toBe(true);
  expect(mockRepository.save).toHaveBeenCalled();
});
```

Requirements:
- One behavior per test
- Test names must read as **capabilities**, not as internals
- Good: `user can create order with calculated total`
- Bad: `createOrder calls handler then saves to repository`
- Uses real domain types, not mocks (unless truly unavoidable)
- Tests behavior, not implementation
- Expected values must come from an independent source of truth — a known-good literal, a worked example, the spec — not recomputed the way the code does (no tautological assertions)

**Run the test and watch it fail:**

```
npm run test -- features/create-order/create-order.test.ts
```

Confirm:
- Test fails (not errors from typos)
- Failure message is expected
- Fails because the feature is missing

Test passes immediately? You're testing existing behavior. Fix the test.

### Step 3 — Write the GREEN implementation

Write the **minimum** code to make the test pass.

```typescript
// features/create-order/create-order.handler.ts
export async function execute(request: CreateOrderRequest): Promise<Result<Order>> {
  const total = request.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const order = { id: 'order-1', ...request, total, createdAt: new Date() };
  return Result.success(order);
}
```

Nothing more. No logging, no extra validation, no "improvements". Address those in later cycles if needed.

**Cheating is OK in GREEN:**
- Hardcode return values
- Copy-paste
- Skip edge cases
- Duplicate code

Address these in later cycles if needed.

### Step 4 — Watch it pass

```
npm run test -- features/create-order/create-order.test.ts
```

Confirm:
- Test passes
- No regressions in other tests

### Step 5 — Repeat

Next failing test for the next behavior:

```
RED:   test "duplicate order returns conflict" → fails
GREEN: add uniqueness check → passes
```

One cycle at a time. One slice at a time.

---

## Slice Completion Checklist

Before marking a slice complete:

- [ ] Slice folder follows `features/<use-case>/` naming
- [ ] Every public behavior has a test that **failed first**
- [ ] Tests use real domain types (mocks only for external boundaries)
- [ ] Implementation is minimal — no speculative features
- [ ] All tests pass (`npm run test`)
- [ ] Linter passes (`npm run lint`)
- [ ] Typecheck passes (`npm run typecheck`)

Can't check all boxes? You skipped TDD or vertical slice discipline. Delete the code. Start over.

---

## Common Rationalizations (Do Not Accept)

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll write tests after" | Tests passing immediately prove nothing. |
| "Tests after achieve the same goals" | Tests-after = "what does this do?" Tests-first = "what should this do?" |
| "Already manually tested" | Ad-hoc ≠ systematic. No record, can't re-run. |
| "Deleting X hours is wasteful" | Sunk cost fallacy. Keeping unverified code is technical debt. |
| "Keep as reference, write tests first" | You'll adapt it. That's testing after. Delete means delete. |
| "Need to explore first" | Fine. Throw away exploration, start with TDD. |
| "Horizontal slicing is faster" | You're deferring integration risk. Vertical slices surface bugs immediately. |
| "I can add tests later" | No. Tests must exist and fail first. |
| "TDD will slow me down" | TDD is faster than debugging in production. Pragmatic = test-first. |

---

## Red Flags — STOP and Start Over

If you catch yourself doing any of these, delete the code and restart with TDD + vertical slices:

- Code before test
- Test after implementation
- Test passes immediately on first run
- Can't explain why test failed
- Tests added "later"
- Rationalizing "just this once"
- "I already manually tested it"
- "Tests after achieve the same purpose"
- "Keep as reference" or "adapt existing code"
- "Already spent X hours, deleting is wasteful"
- "TDD is dogmatic, I'm being pragmatic"
- "This is different because..."
- Writing all tests for a slice before writing any implementation (horizontal slicing)
- Placing code in `services/`, `repositories/`, or `controllers/` folders instead of a slice
- Sharing handler logic between slices

**All of these mean: Delete code. Start over with vertical slices + TDD.**

---

## Integration with Other PRIDES Skills

| Skill | When to invoke |
|-------|----------------|
| `prides-gate-loop` | Any gate fails during Implement |
| `prides-review` | After implementation, before Deploy |
| `prides-deploy` | When all Implement gates pass |
| `prides-heartbeat` | During long implementation sessions |
| `prides-secure` | After deploy, for security hardening |

---

## Handoff Checklist

Before advancing from Implement to Deploy:

- [ ] All slices follow vertical slice structure
- [ ] Every production function has a test that failed first
- [ ] All tests pass
- [ ] Linter passes
- [ ] Typecheck passes
- [ ] No horizontal slicing artifacts remain
- [ ] `prides_gates` shows no `fail`
- [ ] `prides_phase_advance` succeeds (I → D)

---

## References

- Jimmy Bogard: [Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/) — the origin of the approach (2026)
- Milan Jovanović: [Vertical Slice Architecture in .NET](https://milanjovanovic.tech/blog/vertical-slice-architecture-dotnet) — complete 2026 guide with modular monolith fit
- Anton DevTips: [How to Structure Production Apps with VSA in 2026](https://antondevtips.com/blog/how-to-structure-production-apps-with-vertical-slice-architecture-in-dotnet-in-2026) — endpoint/handler pattern
- Chanh Le: [Vertical Slice Architecture Guide](https://chanhle.dev/en/blog/vertical-slice-architecture-guide) — comparison with layered/clean/hexagonal
- Dieste et al.: [The role of slicing in test-driven development](https://arxiv.org/abs/2407.13258) — academic foundation linking vertical slices to TDD contracts
- Martin Fowler: [Test Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html) — canonical RED-GREEN-REFACTOR source; this skill follows Matt Pocock's June 2026 update: refactoring is removed from the implementation loop and belongs to the review stage
- Kent Beck: *Test-Driven Development by Example* (2002) — the original TDD text
