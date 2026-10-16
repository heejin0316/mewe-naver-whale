// Change this version when the scope of consent changes, not for cosmetic policy edits.
export const CONSENT_VERSION = "2026-10-16.1";
export const CONSENT_KEY = "mewe.sharingConsent";

export function hasSharingConsent(record) {
  return record?.version === CONSENT_VERSION && record?.processing === true &&
    record?.overseas === true && typeof record?.acceptedAt === "string" &&
    Number.isFinite(Date.parse(record.acceptedAt));
}

export function consentRecord(payload, now = new Date()) {
  if (payload?.version !== CONSENT_VERSION || payload?.processing !== true || payload?.overseas !== true) {
    throw new Error("공유 기능의 개인정보 처리와 국외 이전에 동의해 주세요.");
  }
  return { version: CONSENT_VERSION, processing: true, overseas: true, acceptedAt: now.toISOString() };
}
