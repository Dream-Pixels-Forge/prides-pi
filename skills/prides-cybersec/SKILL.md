---
name: prides-cybersec
description: >
  Comprehensive cybersecurity skill for pi-prides. Covers the full 2026 threat
  landscape: AI-augmented attacks, supply-chain compromise, LLM prompt injection,
  memory-safety vulnerabilities, post-quantum cryptography readiness, zero-trust
  enforcement, container/cloud-native security, and incident response. Use when
  the user is hardening code, running a security audit, responding to an incident,
  or needs to reason about any current or emerging security concern.
license: MIT
compatibility: Requires the pi-prides extension loaded (provides the prides_* tools).
metadata:
  author: Dream-Pixels-Forge
  version: "1.0"
---

# PRIDES Cybersecurity Skill

A quality-gated, audit-trailed security workflow covering the full 2026+ threat
landscape. Every action is logged to PRIDES state and blocked by PRIDES guards
during inappropriate phases.

---

## When This Skill Activates

Trigger on any of:
- "security audit", "pentest", "CVE", "vulnerability", "hardening"
- "prompt injection", "LLM security", "AI attack"
- "supply chain", "SBOM", "dependency audit", "typosquatting"
- "zero trust", "RBAC", "IAM", "secrets leak", "token exposed"
- "incident", "breach", "exploit", "ransomware", "emergency stop"
- "post-quantum", "PQC", "cryptography", "TLS", "certificate"
- "container security", "k8s", "cloud-native", "SSRF", "CORS"

---

## Phase Requirements

Security work spans all PRIDES phases. Before acting:

1. Call `prides_status` — verify the current phase and whether `emergencyStop` is active.
2. For **Implement (I)**: security checks are quality gates on every commit.
3. For **Review (R)**: security review is a mandatory manual gate.
4. For **Secure (S)**: the full audit runs. This is the dedicated hardening phase.
5. Any critical finding at any phase → `prides_emergency_stop "<reason>"` immediately.

---

## Workflow

### Step 1 — Scope & classify

Identify which threat domains apply (see `references/threat-taxonomy.md`):
- [ ] Dependency / Supply-chain
- [ ] Authentication & secrets
- [ ] Injection (SQL, SSRF, XSS, prompt injection)
- [ ] Cryptography & transport
- [ ] Container / cloud-native
- [ ] LLM-specific threats
- [ ] AI-augmented attacks
- [ ] Data privacy & compliance

### Step 2 — Run PRIDES security gates

```
prides_gates          # runs all gates for current phase
prides_gate security  # run specifically the security audit gate
```

The default `security` gate executes `npm run audit:security`. Projects should
configure `.prides/gates.config.json` to wire real scanners (see Step 3).

### Step 3 — Recommended scanner suite (2026 baseline)

Configure in `.prides/gates.config.json`:

```json
{ "gates": [
  { "name": "dep-audit",      "phase": "I", "type": "command", "command": "npm audit --audit-level=moderate" },
  { "name": "sca-scan",       "phase": "I", "type": "command", "command": "npx better-npm-audit --level moderate" },
  { "name": "sast-semgrep",   "phase": "I", "type": "command", "command": "semgrep --config=auto --error ." },
  { "name": "secrets-scan",   "phase": "I", "type": "command", "command": "trufflehog git file://. --only-verified" },
  { "name": "sbom-gen",       "phase": "I", "type": "command", "command": "syft . -o spdx-json > sbom.spdx.json" },
  { "name": "container-scan", "phase": "D", "type": "command", "command": "grype sbom:sbom.spdx.json --fail-on medium" },
  { "name": "dast-owasp",     "phase": "D", "type": "command", "command": "zap-cli quick-scan --self-contained --start-options '-config api.disablekey=true' http://localhost:3000" },
  { "name": "pqc-check",      "phase": "S", "type": "command", "command": "npx pqc-lint --check-tls --check-signatures ." },
  { "name": "security",       "phase": "S", "type": "command", "command": "npm run audit:security" },
  { "name": "security-review","phase": "S", "type": "manual"  }
]}
```

### Step 4 — Triage findings

For each `fail`:
1. Read the finding output.
2. Look up threat context in `references/threat-taxonomy.md`.
3. Apply the appropriate remediation pattern from `references/remediation-playbooks.md`.
4. Re-run the failed gate: `prides_gate <name>`.
5. Log the fix as an artifact: `prides_artifact kind=security-fix path=<file>`.

**If a finding is critical / actively exploitable:**
```
prides_emergency_stop "CVE-XXXX-XXXXX actively exploitable in prod"
```
Never resume without explicit human approval: `prides_emergency_resume`.

### Step 5 — Manual security review sign-off

The `security-review` gate is **manual** — it blocks phase advancement until a
human security reviewer signs off:
```
/prides approve security-review
```

### Step 6 — Advance

Only after all gates `pass` and the manual gate is signed off:
```
prides_phase_advance
```

---

## Key Threat Domains (2026)

See `references/threat-taxonomy.md` for full detail. Quick reference:

| Domain | Key 2026 Risks | Gate |
|--------|---------------|------|
| Supply-chain | Malicious packages, typosquatting, CI poisoning | `dep-audit`, `sca-scan`, `sbom-gen` |
| Secrets & IAM | Leaked tokens, over-privileged keys, JWKS abuse | `secrets-scan` |
| Injection | SSRF, SQL, XSS, prompt injection, SSTI | `sast-semgrep`, `dast-owasp` |
| LLM threats | Prompt injection, jailbreak, training-data exfil | `sast-semgrep` + manual |
| AI-augmented attacks | AI-generated phishing, adaptive malware | Manual review |
| Cryptography | Weak ciphers, expired certs, PQC readiness | `pqc-check` |
| Container/cloud | Privilege escalation, IMDS abuse, misconfigured RBAC | `container-scan` |
| Memory safety | Buffer overflows, use-after-free in FFI/native | `sast-semgrep` |

---

## Incident Response Quick Reference

1. **Contain**: `prides_emergency_stop "<reason>"` — halts all mutations.
2. **Identify**: Gather logs, isolate affected systems, note CVE/IoC.
3. **Eradicate**: Apply patches, rotate secrets, rebuild affected images.
4. **Recover**: Re-run all gates. Get manual sign-off. `prides_emergency_resume`.
5. **Post-mortem**: `prides_artifact kind=incident-report path=dev_notes/incident-<date>.md`.

---

## References

- `references/threat-taxonomy.md` — Full 2026+ threat taxonomy with MITRE mappings
- `references/remediation-playbooks.md` — Concrete code-level fixes per threat type
- `references/secure-defaults.md` — Security-by-default configuration checklists
