# M2.2: pilot acceptance implementation and evidence

Continues PR #1 from `5f1920e`. No merge or cloud publication. Genuine provider samples and external account permissions are absent; live acceptance remains pending.

## Funnel and discovery

`pilotSummaries` reports separately attributed Gmail receipt count, successfully validated unique proposed listings, pending proposals/reviews, persisted real listings, ACTIVE profile matches, insufficient assessments and complete/current opportunities at the profile threshold. All counts cover retained records, not the remote mailbox total or a daily window. One receipt can contain multiple listings; duplicate deliveries/content are collapsed. Local EML counts are separate. Manual/CSV records enter persisted counts. Repeated proposals are deduplicated by source and external identity. Receipt attribution uses explicit local upload pilot IDs, then configured Gmail labels AND sender selection, otherwise known extracted/linked category and region/body envelope. Incomplete unassigned Gmail receipts are shown globally, not falsely attributed to both pilots. Intake envelopes deliberately precede budget, transaction, fuel and verified body filtering.

`GET /api/discovery` and `/yeni-ilanlar` show only real ACTIVE identities, including unscored/missing-data records. Optional profile selection uses the same final filters as pilot cards. Opportunities require no missing comparison fields, current assessment, five comparables, adequate confidence and the threshold. This conservative display gate does not replace the existing analysis engine or manufacture missing values.

`POST /api/email/complete` accepts explicit reviewed corrections only to missing extracted fields. Source URL/external ID must agree with the recognized provider. Before/after values, evidence note and timestamp persist in `EmailFieldCorrection`. Existing listing details can be completed without rewriting identity, price observations or last observed time; analysis is invalidated. Real/demo and body verification flags cannot be changed through this endpoint. Body evidence is approved through the existing dedicated review. No template becomes approved merely through a correction; subsequent messages do not inherit missing fields. Unsupported messages without extracted proposals cannot be made into supported templates through this form.

## Seven-day drops

The pure `recentPriceDrops` function sorts all valid positive observations through now, compares immediate consecutive observations and includes only downward events dated within a rolling seven-day window. Older observations establish the predecessor but do not become recent events. Duplicate timestamp/price observations collapse; unchanged prices cause no event. Contradictory simultaneous prices reset the predecessor rather than invent an ordering. Invalid/future observations are excluded. Stable event keys prevent repeated display/counts. Results include previous/new prices, decimal amount/percentage and observation time. Historical maximum-to-current indicators remain separate. EML dates are unverified email header dates; Gmail observation times use internalDate. Neither proves the seller's exact change time.

## Operations

Readiness does not infer live success from credential presence. Scheduler state persists a heartbeat every minute, becomes STALE after 130 seconds, and stores last tick/result. An active heartbeat is not proof of successful remote intake. Gmail uses the existing readonly OAuth/PKCE and selected-label/sender checks. Production OAuth additionally requires an explicitly absolute persistent token path and `GMAIL_TOKEN_STORE_PERSISTENT=true`. This flag is an operator declaration; restart persistence must still be verified. Tokens are AES-GCM encrypted, atomically written with file/directory fsync and 0600/0700 permissions; symlink final paths and insecure read permissions are rejected. The encryption key stays in server secret management, separate from the persistent encrypted file.

`compose.runtime.yaml` is an operator opt-in overlay with a shared named token volume, isolated PostgreSQL volume, migration/bootstrap without demo seeding, web health check and worker restart policy. DATABASE_URL must use the `postgres` service host when run in containers. Secrets must be supplied securely in `.env`/server settings. No production deployment is executed by this change. The existing single-user Basic access gate and TLS reverse proxy must be configured before public exposure.

Telegram and SMTP adapters remain opt-in. SMTP marks success only after recipient acceptance, rejects missing/partial acceptance and preserves ambiguous-delivery handling. Daily reports are prepared in-app/copiable; existing opportunity notifications dispatch through configured enabled channels. Whole-report delivery is not falsely claimed. Readiness tracks real-record SENT timestamps, meaning provider acceptance, not proof of inbox delivery. No external service test is performed without credentials and permission.

GitHub Actions CI adds PostgreSQL migration, unit/integration, lint, build/types and production Playwright checks. It deploys nothing. Runtime readiness links to actual GitHub results instead of guessing workflow status from the presence of a YAML file.

## Acceptance prerequisites

Read `../CANLI_PILOT_KURULUM.md`. Real provider files, user template review, comparison/body evidence, Google OAuth permission, persistent storage/restart test, observed 09.00 scheduler execution and recipient-side live delivery remain user/operator acceptance steps. Synthetic fixture/protocol tests never certify genuine template support.
