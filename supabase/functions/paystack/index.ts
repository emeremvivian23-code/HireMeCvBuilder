import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAYSTACK_BASE = "https://api.paystack.co";
const PRO_PRICE_KOBO = 350000;
const PRO_PRICE_NAIRA = 3500;
const CURRENCY = "NGN";
const REFERENCE_PATTERN = /^[A-Za-z0-9_-]{6,100}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function paystackRequest(path: string, secret: string, init?: { method?: string; body?: unknown }) {
  const response = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message ?? `Paystack request failed (${response.status})`);
  }
  return payload.data;
}

async function initializeTransaction(
  secret: string,
  userId: string,
  email: string,
): Promise<{ access_code: string; reference: string }> {
  const reference = `hmcv_${crypto.randomUUID()}`;
  const data = await paystackRequest("/transaction/initialize", secret, {
    method: "POST",
    body: {
      email,
      amount: PRO_PRICE_KOBO,
      currency: CURRENCY,
      reference,
      metadata: { user_id: userId, plan: "pro" },
    },
  });
  if (typeof data?.access_code !== "string" || typeof data?.reference !== "string") {
    throw new Error("Unexpected response from Paystack");
  }
  return { access_code: data.access_code, reference: data.reference };
}

async function verifyAndActivate(
  secret: string,
  userId: string,
  reference: string,
  supabaseUrl: string,
  serviceRoleKey: string,
) {
  const data = await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, secret);

  const paid =
    data?.status === "success" &&
    data?.currency === CURRENCY &&
    typeof data?.amount === "number" &&
    data.amount >= PRO_PRICE_KOBO &&
    data?.metadata?.user_id === userId;

  if (!paid) {
    return { success: false, status: 402, error: "Payment not completed for this account" };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: result, error } = await admin.rpc("apply_paystack_payment", {
    p_user_id: userId,
    p_amount: PRO_PRICE_NAIRA,
    p_reference: reference,
  });
  if (error) throw new Error(error.message);
  if (!result?.success) {
    return { success: false, status: 500, error: "Could not activate Pro for this payment" };
  }
  return { success: true, status: 200, already_processed: result.already_processed === true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY") ?? "";

    if (!secret) {
      return json({ error: "Payments are not configured yet" }, 503);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Please sign in to continue" }, 401);
    }
    const user = userData.user;

    const body = await req.json().catch(() => null);
    const action = body?.action;

    if (action === "initialize") {
      if (!user.email) return json({ error: "Your account has no email address" }, 400);
      const result = await initializeTransaction(secret, user.id, user.email);
      return json(result);
    }

    if (action === "verify") {
      const reference = body?.reference;
      if (typeof reference !== "string" || !REFERENCE_PATTERN.test(reference)) {
        return json({ error: "Invalid payment reference" }, 400);
      }
      const result = await verifyAndActivate(secret, user.id, reference, supabaseUrl, serviceRoleKey);
      const { status, ...payload } = result;
      return json(payload, status);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("paystack function error", err);
    return json({ error: "Payment request failed. Please try again." }, 500);
  }
});
