import { db } from "./db";
import { mailboxHealth } from "./email/coverage";
import { tokenStorageStatus } from "./email/secrets";
import { credentialStatus } from "./notifications";
import { schedulerStatus } from "./scheduler-health";
export async function liveReadiness() {
  const [mail, scheduler, settings, sent, templates, samples] =
    await Promise.all([
      mailboxHealth(),
      schedulerStatus(),
      db.appSettings.findUnique({ where: { id: "personal" } }),
      db.notification.groupBy({
        by: ["channel"],
        where: {
          status: "SENT",
          sentAt: { not: null },
          listing: { isDemo: false },
        },
        _max: { sentAt: true },
      }),
      db.emailTemplate.count({
        where: { status: "USER_APPROVED", liveValidatedAt: { not: null } },
      }),
      db.emailMessage.count(),
    ]);
  const creds = credentialStatus();
  return {
    gmail: {
      status: mail.status,
      configured: mail.configuration.configured,
      selectionSaved: !!(
        mail.mailbox.labelIds.length + mail.mailbox.senders.length
      ),
      lastSuccessAt: mail.mailbox.lastSuccessAt,
      missing: mail.configuration.missing,
    },
    storage: tokenStorageStatus(),
    scheduler,
    channels: [
      {
        channel: "TELEGRAM",
        configured: creds.telegram,
        enabled: !!settings?.telegramEnabled,
        lastVerifiedSentAt:
          sent.find((s) => s.channel === "TELEGRAM")?._max.sentAt ?? null,
      },
      {
        channel: "EMAIL",
        configured: creds.email,
        enabled: !!settings?.emailEnabled,
        lastVerifiedSentAt:
          sent.find((s) => s.channel === "EMAIL")?._max.sentAt ?? null,
      },
    ],
    samples: {
      uploaded: samples,
      gmailMatchedTemplates: templates,
      needsRealExamples: templates === 0,
    },
    ci: {
      workflow: ".github/workflows/ci.yml",
      url: "https://github.com/Alikasimoglu247/f-rsat/actions",
      status: "CHECK_GITHUB_RUNS",
    },
  };
}
