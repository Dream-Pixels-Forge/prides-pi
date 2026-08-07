# Threat Taxonomy — 2026+ Landscape

Full taxonomy mapped to MITRE ATT&CK (where applicable), OWASP Top 10:2025,
and emerging 2026 threat categories. Used by the `prides-cybersec` skill to
classify findings and select the correct remediation playbook.

---

## T1 — Software Supply-Chain

**Risk level: CRITICAL**

### T1.1 Dependency Confusion / Typosquatting
- Attacker publishes a malicious package with the same or similar name as an
  internal package, causing the package manager to resolve to the attacker's
  version.
- **2026 escalation**: AI-generated packages that mimic popular APIs; LLMs
  recommending non-existent packages that attackers then register (hallucination
  squatting).
- MITRE: T1195.001
- Gate: `dep-audit`, `sca-scan`
- Fix: pin exact versions with lockfiles; use `npm audit signatures`; enable
  `provenance` publishing; use a private registry with scope allowlists.

### T1.2 CI/CD Pipeline Poisoning
- Malicious PRs or compromised secrets inject malicious steps into build pipelines.
- **2026 escalation**: AI-assisted PR attacks that pass automated review but
  contain obfuscated payload delivery in post-install scripts.
- MITRE: T1195.002
- Gate: `secrets-scan`, manual security review
- Fix: require signed commits; pin GitHub Actions to SHA; use OIDC for
  cloud credentials; never pass `GITHUB_TOKEN` to untrusted actions.

### T1.3 SBOM Gaps & License Violations
- Missing software bill of materials; transitive dependencies with incompatible
  or vulnerable licenses.
- Gate: `sbom-gen`, `sca-scan`
- Fix: generate SPDX/CycloneDX SBOM on every build; integrate with VEX
  (Vulnerability Exploitability eXchange) feeds.

---

## T2 — Authentication, Secrets & Identity

**Risk level: CRITICAL**

### T2.1 Secret Leakage
- API keys, tokens, private keys committed to source control or embedded in
  build artifacts / Docker image layers.
- **2026 escalation**: secrets in AI training prompts; LLM context windows
  captured in logs.
- Gate: `secrets-scan`
- Fix: use `git-secrets`, `trufflehog`, `gitleaks`; rotate on detection;
  use secrets managers (Vault, AWS Secrets Manager, Azure Key Vault);
  enforce `.gitignore` with pre-commit hooks.

### T2.2 JWT / JWKS Abuse
- Weak JWT algorithms (`alg:none`, RS→HS confusion), forged tokens, JWKS
  endpoint hijacking.
- Gate: `sast-semgrep`
- Fix: enforce `alg` whitelist server-side; validate `iss`, `aud`, `exp`;
  use short-lived tokens + refresh token rotation; pin JWKS endpoint.

### T2.3 Over-Privileged IAM / RBAC
- Cloud roles or service accounts with wildcard permissions; no least-privilege.
- **2026 escalation**: AI agents granted excessive tool-calling permissions
  leading to privilege escalation via prompt injection.
- Gate: Manual security review + `container-scan` (checks pod security context)
- Fix: apply least-privilege; use workload identity; audit IAM bindings
  with tools like `Prowler`, `ScoutSuite`.

### T2.4 Passkey / MFA Bypass
- Attacker-in-the-middle (AiTM) phishing bypasses TOTP/push MFA; SIM-swapping.
- Fix: enforce FIDO2/WebAuthn passkeys; use phishing-resistant MFA;
  monitor for AiTM indicators (Evilginx, Modlishka).

---

## T3 — Injection & Input Validation

**Risk level: HIGH**

### T3.1 SQL / NoSQL Injection
- Unsanitised user input passed to database queries.
- OWASP: A03:2025
- Gate: `sast-semgrep`, `dast-owasp`
- Fix: parameterised queries / prepared statements; ORM query builders;
  input validation with allowlists.

### T3.2 Server-Side Request Forgery (SSRF)
- Application fetches attacker-controlled URLs, reaching internal services or
  cloud metadata endpoints (IMDS).
- **2026 escalation**: SSRF via LLM-generated URLs; agentic systems fetching
  arbitrary tool-provided URLs.
- OWASP: A10:2025
- Gate: `sast-semgrep`, `dast-owasp`
- Fix: allowlist outbound destinations; block RFC-1918/link-local ranges;
  disable IMDS v1 (require IMDSv2); use network egress controls.

### T3.3 Cross-Site Scripting (XSS)
- Reflected, stored, DOM-based XSS injecting malicious scripts.
- Gate: `sast-semgrep`, `dast-owasp`
- Fix: Content-Security-Policy headers; contextual output encoding;
  use framework escape functions; `DOMPurify` for HTML sanitisation.

### T3.4 Prompt Injection (LLM-specific)
- Malicious instructions in user input, tool output, or retrieved documents
  hijack an LLM agent's behaviour.
- **2026 escalation**: indirect prompt injection via web-browsing, RAG
  retrieval, email parsing, or tool call responses.
- No single automated gate — requires manual review + defence-in-depth:
  - Separate trusted instructions from untrusted data in prompt templates.
  - Validate and sanitise all external content before including in context.
  - Apply output filtering and refusal policies.
  - Log all tool calls and model outputs for audit.
  - Implement human-in-the-loop for high-risk operations.
  - Use capability restrictions: never give agents unrestricted `write` or
    `exec` access.

### T3.5 Server-Side Template Injection (SSTI)
- Template engines (Jinja2, Pebble, Twig) execute attacker-controlled expressions.
- Gate: `sast-semgrep`
- Fix: never pass user input directly to template `render()`; use sandboxed
  template environments.

---

## T4 — Cryptography & Transport Security

**Risk level: HIGH**

### T4.1 Weak / Deprecated Algorithms
- MD5, SHA-1, DES, 3DES, RC4, RSA <2048-bit, ECDSA P-192 still in use.
- Gate: `sast-semgrep`, `pqc-check`
- Fix: use SHA-256+, AES-256-GCM, RSA ≥3072-bit or ECDSA P-256/P-384;
  rotate keys; audit crypto libraries.

### T4.2 TLS Misconfiguration
- TLS 1.0/1.1 enabled; weak cipher suites; missing HSTS; invalid/expired
  certificates; no certificate pinning in mobile.
- Gate: `pqc-check`, `dast-owasp`
- Fix: enforce TLS 1.3; configure strong cipher suites only; enable HSTS
  with `includeSubDomains` and `preload`; use ACME for certificate automation.

### T4.3 Post-Quantum Cryptography (PQC) Readiness
- **2026 critical**: NIST has finalised PQC standards (ML-KEM/CRYSTALS-Kyber,
  ML-DSA/CRYSTALS-Dilithium, SLH-DSA/SPHINCS+). Harvest-now-decrypt-later
  (HNDL) attacks capture ciphertext today for future quantum decryption.
- Gate: `pqc-check`
- Action:
  1. Audit all long-lived key exchanges (TLS session keys, encrypted backups).
  2. Plan migration to hybrid classical+PQC schemes.
  3. Prefer X25519Kyber768 hybrid for TLS key exchange where supported.
  4. Sign code artifacts with ML-DSA alongside existing ECDSA.

### T4.4 Secrets in Transit / At Rest
- Unencrypted sensitive fields in databases, logs, backups, or audit trails.
- Gate: `sast-semgrep`, `secrets-scan`
- Fix: encrypt PII/PHI fields at rest with AES-256; enforce TLS on all
  internal service-to-service traffic; redact secrets from logs.

---

## T5 — Container & Cloud-Native Security

**Risk level: HIGH**

### T5.1 Container Privilege Escalation
- Running containers as root; privileged containers; host PID/network namespaces.
- Gate: `container-scan`
- Fix: run as non-root user; use `securityContext.runAsNonRoot: true`;
  drop all capabilities (`ALL`) and add only needed ones; use `readOnlyRootFilesystem`.

### T5.2 Image Vulnerabilities
- Base images with unpatched OS packages or runtimes.
- Gate: `container-scan` (Grype/Trivy)
- Fix: use minimal base images (distroless, Alpine); pin image digests;
  rebuild images on upstream CVE publication; scan in CI and registry.

### T5.3 Kubernetes RBAC Misconfiguration
- `cluster-admin` bindings; wildcard verbs; pods mounting sensitive secrets.
- Gate: Manual review + `container-scan`
- Fix: audit with `kube-bench`, `Polaris`; apply Pod Security Standards;
  use OPA/Gatekeeper for admission control.

### T5.4 Cloud Metadata Service Abuse (IMDS)
- Workloads reaching AWS/GCP/Azure IMDS to steal instance credentials.
- Gate: `sast-semgrep` (detect internal IP patterns), `dast-owasp`
- Fix: enforce IMDSv2 (hop-limit=1); use Workload Identity instead of
  instance credentials; block 169.254.169.254 at network policy level.

### T5.5 Misconfigured Storage / Object ACLs
- Public S3 buckets, GCS objects, or Azure Blob containers exposing sensitive data.
- Gate: Manual review (infrastructure-as-code scanning with `checkov`, `tfsec`)
- Fix: enforce `BlockPublicAcls`; use bucket policies with least-privilege;
  enable object-level logging.

---

## T6 — LLM & AI-Specific Threats

**Risk level: HIGH (Emerging)**

### T6.1 LLM Prompt Injection (Direct & Indirect)
See T3.4 for full detail.

### T6.2 Training Data Extraction
- Adversarial queries elicit verbatim memorised training data (PII, credentials,
  proprietary content) from LLMs.
- Fix: differential privacy in fine-tuning; output classifiers to detect
  memorised content; rate-limit sensitive completions.

### T6.3 Model Inversion / Membership Inference
- Attackers infer whether specific data was in the training set.
- Fix: apply DP-SGD during training; avoid including sensitive data in
  fine-tuning datasets.

### T6.4 LLM-as-Agent Privilege Escalation
- Malicious instructions passed via tool outputs cause an LLM agent to execute
  privileged operations (file writes, API calls, email sends).
- **2026 critical**: pi-prides-aware defence — PRIDES tool guards already block
  `write`/`edit` during Review/Deploy/Secure phases. Additional measures:
  - Restrict tool capabilities by phase using PRIDES guards.
  - Require human approval for all irreversible operations.
  - Log every tool call with `prides_artifact`.

### T6.5 AI-Generated Social Engineering
- Hyper-personalised phishing, deepfake voice/video, synthetic identities
  created with generative AI.
- **2026 escalation**: fully autonomous AI phishing campaigns that adapt in
  real-time based on target responses.
- Mitigations: DMARC/DKIM/SPF enforcement; out-of-band verification for
  high-value requests; employee awareness training; deepfake detection tools.

---

## T7 — Memory Safety & Native Code

**Risk level: MEDIUM-HIGH**

### T7.1 Buffer Overflow / Heap Corruption
- C/C++ code, FFI bindings, and WebAssembly modules with unsafe memory operations.
- Gate: `sast-semgrep` (detect unsafe patterns in FFI layers)
- Fix: prefer memory-safe languages (Rust, Go) for new components; apply
  Address Sanitizer (`-fsanitize=address`) in CI; use bounds-checked APIs.

### T7.2 Use-After-Free / Double-Free
- Dangling pointer dereferences in native extensions.
- Fix: Rust ownership model; Valgrind/AddressSanitizer in CI; code review
  of all unsafe blocks.

---

## T8 — Data Privacy & Compliance

**Risk level: HIGH (Regulatory)**

### T8.1 PII Leakage in Logs & Errors
- Email addresses, passwords, tokens, health records appearing in logs,
  error responses, or audit trails.
- Gate: `sast-semgrep` (detect log statements with sensitive variable names)
- Fix: structured logging with field redaction; never log request bodies by
  default; scrub PII from error messages returned to clients.

### T8.2 Insecure Data Retention
- Sensitive data stored longer than required by policy; no deletion enforcement.
- Gate: Manual review
- Fix: implement data lifecycle policies; encrypt and time-bound tokens;
  automated deletion jobs.

### T8.3 GDPR / CCPA / AI Act Compliance
- **2026**: EU AI Act enforcement begins. High-risk AI systems require
  conformity assessments, human oversight mechanisms, and transparency logs.
- Fix: document model cards; implement audit logging for all AI decisions;
  provide opt-out and data subject access mechanisms.

---

## MITRE ATT&CK Quick Reference

| PRIDES Gate | MITRE Technique |
|------------|----------------|
| `dep-audit` | T1195.001 (Supply Chain: Software) |
| `secrets-scan` | T1552 (Unsecured Credentials) |
| `sast-semgrep` | T1059 (Command & Scripting Interpreter) |
| `dast-owasp` | T1190 (Exploit Public-Facing Application) |
| `container-scan` | T1610 (Deploy Container) |
| `pqc-check` | T1600 (Weaken Encryption) |
| Manual review | T1566 (Phishing), T1204 (User Execution) |
