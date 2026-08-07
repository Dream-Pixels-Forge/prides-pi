---
name: prides-secure
description: >
  Run the Secure-phase security audit gate and manage the emergency stop. Use when
  the user is hardening, auditing, or responding to a security incident under PRIDES.
license: MIT
compatibility: Requires the pi-prides extension loaded (provides the prides_* tools).
metadata:
  author: Dream-Pixels-Forge
  version: "1.0"
---

# PRIDES Secure

Audit security and control the emergency stop.

## Instructions

1. Call `prides_status` to confirm phase **S (Secure)** and check `emergencyStop` state.
2. Run `prides_gates` (Secure phase). The default `security` gate runs `npm run audit:security`.
3. For each `fail`, remediate the finding (dependency CVE, secret leak, misconfig) and re-run `prides_gate security`.
4. On a **critical** failure or active exploit, trigger `prides_emergency_stop <reason>` to halt all mutations and signal the human governor. Clear it only after resolution with `prides_emergency_resume`.
5. Log the audit artifact with `prides_artifact` (kind `security-audit`).
6. Advance only when `prides_gates` shows no `fail` (or a manual gate is signed off via `prides_gate <name> --approve`).

## Emergency stop
`prides_emergency_stop` blocks `write`/`edit`/`bash`. It is the human's circuit breaker — never resume without explicit human confirmation.
