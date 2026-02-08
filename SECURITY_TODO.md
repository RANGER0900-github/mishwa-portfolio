# Security Hardening Plan

## Phase 1 - Immediate (this sprint)
- [x] Harden request filtering for common exploit signatures:
  SQL injection, NoSQL operator injection, command injection, XSS, and path traversal.
- [x] Add adaptive abuse controls:
  temporary IP auto-blocking after repeated rate-limit/injection violations.
- [x] Improve attack observability:
  security notifications include IP plus geo/network context when available.
- [x] Add strict API response caching policy (`Cache-Control: no-store`) for admin/API traffic.

## Phase 2 - High Priority
- [ ] Add WAF/reverse-proxy security at edge (Cloudflare/Render edge):
  bot fight mode, managed OWASP rules, geo/rate controls, JS challenge for suspicious traffic.
- [ ] Add Redis-backed distributed rate limits in production:
  mandatory for multi-instance deployments to resist coordinated bursts.
- [ ] Add admin-only CSRF protection:
  anti-CSRF token validation for state-changing admin routes.
- [ ] Add signed audit log stream:
  append-only log for admin actions and security events.

## Phase 3 - Advanced Attack Defense
- [ ] Brute-force and credential-stuffing defense:
  per-account lockouts + captcha challenge escalation.
- [ ] Session hardening:
  rotate session ID on privilege transitions, strict idle timeout, and device-bound session metadata.
- [ ] Supply-chain defense:
  npm audit gate, lockfile verification, dependency allowlist, weekly update automation.
- [ ] File upload hardening:
  MIME sniff validation, image transcoding sandbox, malware scan hook before persistence.
- [ ] API abuse anomaly detection:
  baseline traffic model, alert on spikes in route/IP error ratio and request entropy.

## Phase 4 - Monitoring and Response
- [ ] Security dashboard widgets:
  blocked IP timeline, top attacking ASNs, attack-type trend.
- [ ] Alerting:
  webhook/Telegram/email alerts for critical attack thresholds.
- [ ] Incident response runbook:
  contain, eradicate, recover, and postmortem checklist for admin/operator use.
- [ ] Backup + restore drills:
  monthly restoration tests for content/auth/analytics snapshots.

## Deployment Baseline
- [ ] Enforce HTTPS only, HSTS preload, and secure cookie settings on all environments.
- [ ] Separate secrets by environment with rotation policy and expiry checks.
- [ ] Restrict production CORS origins explicitly and keep wildcard disabled.
- [ ] Add health + readiness checks plus autoscaling thresholds tuned for burst traffic.
