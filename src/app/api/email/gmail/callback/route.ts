import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { completeGmailConsent } from "@/lib/email/gmail";
import { OAUTH_COOKIE } from "@/lib/email/api";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams,
    cookie = await cookies();
  let success = false;
  try {
    if (query.has("error")) throw new Error("Kullanıcı onay vermedi.");
    await completeGmailConsent(
      query.get("code") ?? "",
      query.get("state") ?? "",
      cookie.get(OAUTH_COOKIE)?.value ?? "",
    );
    success = true;
  } catch {
    console.info(JSON.stringify({ event: "gmail.oauth.incomplete" }));
  }
  const response = NextResponse.redirect(
    new URL(
      `/veri-kaynaklari?gmail=${success ? "authorized" : "error"}`,
      process.env.APP_BASE_URL ?? request.url,
    ),
  );
  response.cookies.set(OAUTH_COOKIE, "", {
    maxAge: 0,
    path: "/api/email/gmail/callback",
    httpOnly: true,
    sameSite: "lax",
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
