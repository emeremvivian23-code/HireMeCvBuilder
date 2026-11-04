// Edge function: withdrawal status email notifications
//
// Triggered two ways:
//   1. Cron / scheduled invocation (POST with no body) -> drains the queue.
//   2. Admin dashboard fire-and-forget after a status change (POST with {"trigger": true}).
//
// Reads pending emails from notification_outbox via send_next_notification_email()
// (claims one row at a time, atomically), sends each through Resend, then records
// the result. Loops until the queue is empty or the max per-invocation budget is hit.
//
// Required secret: RESEND_API_KEY (Resend API key).
// Optional secret: MAIL_FROM (sender address, e.g. noreply@yourdomain.com).
//
// No auth context is used: the service role key authorizes the RPCs.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? "HiremCV <noreply@hiremcv.com>";

const MAX_PER_INVOCATION = 25;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface ClaimedMessage {
  has_message: boolean;
  id?: string;
  recipient_email?: string;
  subject?: string;
  html_body?: string;
  source?: string;
  attempts?: number;
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC ${name} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

async function sendOneEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ messageId: string | null; error: string | null }> {
  if (!RESEND_API_KEY) {
    return { messageId: null, error: "RESEND_API_KEY secret is not configured" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { messageId: null, error: `Resend ${res.status}: ${text}` };
    }

    const data = await res.json();
    return { messageId: data.id ?? null, error: null };
  } catch (err) {
    return { messageId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function drainQueue(): Promise<{ processed: number; sent: number; failed: number }> {
  let processed = 0;
  let sent = 0;
  let failed = 0;

  while (processed < MAX_PER_INVOCATION) {
    let claimed: ClaimedMessage;
    try {
      claimed = await callRpc<ClaimedMessage>("send_next_notification_email", {});
    } catch (err) {
      console.error("claim error:", err instanceof Error ? err.message : err);
      break;
    }

    if (!claimed.has_message || !claimed.id || !claimed.recipient_email) {
      break;
    }

    processed += 1;

    const result = await sendOneEmail(
      claimed.recipient_email,
      claimed.subject ?? "(no subject)",
      claimed.html_body ?? ""
    );

    if (result.error) {
      failed += 1;
      try {
        await callRpc("record_notification_failed", {
          p_id: claimed.id,
          p_error: result.error,
        });
      } catch (err) {
        console.error("record_failed error:", err instanceof Error ? err.message : err);
      }
      console.error(`email ${claimed.id} to ${claimed.recipient_email} failed: ${result.error}`);
    } else {
      sent += 1;
      try {
        await callRpc("record_notification_sent", {
          p_id: claimed.id,
          p_provider_message_id: result.messageId,
        });
      } catch (err) {
        console.error("record_sent error:", err instanceof Error ? err.message : err);
      }
    }
  }

  return { processed, sent, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stats = await drainQueue();
    return new Response(
      JSON.stringify({ success: true, ...stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
