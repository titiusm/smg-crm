// Twilio helpers — client singleton, outbound call bridging, SMS send, TwiML builders.
import Twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

let _client: ReturnType<typeof Twilio> | null = null;
export function twilioClient() {
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
  }
  if (!_client) _client = Twilio(accountSid, authToken);
  return _client;
}

/** Validates an incoming Twilio webhook signature. Returns true if valid. */
export function validateTwilioSignature(params: {
  signature: string;
  url: string;
  body: Record<string, string>;
}): boolean {
  if (!authToken) return false;
  return Twilio.validateRequest(authToken, params.signature, params.url, params.body);
}

/** Convert a raw string (digits or E.164) into E.164 format, defaulting to +1 if 10 digits. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed.replace(/\s+/g, "");
  const digits = trimmed.replace(/\D+/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null; // unparseable
}

/** Public URL for webhook callbacks (ngrok in dev, production URL in prod). */
export function webhookBaseUrl(): string {
  const fromEnv = process.env.PUBLIC_WEBHOOK_URL || process.env.APP_URL || process.env.AUTH_URL;
  if (!fromEnv) throw new Error("PUBLIC_WEBHOOK_URL is not set");
  return fromEnv.replace(/\/$/, "");
}

/** Initiate an outbound call from a rep's Twilio number to `toNumber`, bridged to the rep's cell. */
export async function bridgeCall(opts: {
  fromTwilioNumber: string;
  repPersonalNumber: string;
  toNumber: string;
  metadata: { companyId: string; contactId?: string | null; repId: string };
}) {
  const client = twilioClient();
  const base = webhookBaseUrl();
  const params = new URLSearchParams({
    to: opts.toNumber,
    companyId: opts.metadata.companyId,
    repId: opts.metadata.repId,
    ...(opts.metadata.contactId ? { contactId: opts.metadata.contactId } : {}),
  });
  // Call the rep first; once they pick up, TwiML <Dial> will connect the contact.
  const call = await client.calls.create({
    to: opts.repPersonalNumber,
    from: opts.fromTwilioNumber,
    url: `${base}/api/twilio/voice/bridge?${params.toString()}`,
    statusCallback: `${base}/api/twilio/voice/status`,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    statusCallbackMethod: "POST",
    record: true,
    recordingStatusCallback: `${base}/api/twilio/voice/recording`,
    recordingStatusCallbackEvent: ["completed"],
    recordingStatusCallbackMethod: "POST",
  });
  return call;
}

/** Send an SMS from a rep's Twilio number to a contact. */
export async function sendSms(opts: {
  fromTwilioNumber: string;
  toNumber: string;
  body: string;
}) {
  const client = twilioClient();
  const base = webhookBaseUrl();
  return client.messages.create({
    from: opts.fromTwilioNumber,
    to: opts.toNumber,
    body: opts.body,
    statusCallback: `${base}/api/twilio/sms/status`,
  });
}

// ----------------------------------------------------------------------------
// TwiML builders (return XML strings for the Twilio webhook responses)
// ----------------------------------------------------------------------------

/** TwiML for inbound calls: forward to the rep's personal cell and record. */
export function forwardToRepTwiML(opts: {
  repPersonalNumber: string;
  callerId: string;
  recordingCallbackUrl: string;
  statusCallbackUrl: string;
  twoPartyConsentAnnouncement?: string | null;
}): string {
  const VoiceResponse = Twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  if (opts.twoPartyConsentAnnouncement) {
    response.say(
      { voice: "Polly.Joanna" },
      opts.twoPartyConsentAnnouncement
    );
  }
  const dial = response.dial({
    callerId: opts.callerId,
    record: "record-from-answer-dual",
    recordingStatusCallback: opts.recordingCallbackUrl,
    recordingStatusCallbackEvent: ["completed"],
    action: opts.statusCallbackUrl,
    timeout: 20,
  });
  dial.number(opts.repPersonalNumber);
  return response.toString();
}

/** TwiML for the outbound bridge: once the rep answers, dial the contact. */
export function bridgeToContactTwiML(opts: {
  contactNumber: string;
  callerId: string;
  recordingCallbackUrl: string;
  statusCallbackUrl: string;
  twoPartyConsentAnnouncement?: string | null;
}): string {
  const VoiceResponse = Twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  if (opts.twoPartyConsentAnnouncement) {
    response.say({ voice: "Polly.Joanna" }, opts.twoPartyConsentAnnouncement);
  }
  const dial = response.dial({
    callerId: opts.callerId,
    record: "record-from-answer-dual",
    recordingStatusCallback: opts.recordingCallbackUrl,
    recordingStatusCallbackEvent: ["completed"],
    action: opts.statusCallbackUrl,
    timeout: 25,
  });
  dial.number(opts.contactNumber);
  return response.toString();
}
