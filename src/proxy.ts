import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
export function proxy(request: NextRequest) {
  const token = process.env.APP_ACCESS_TOKEN;
  if (!token) return NextResponse.next();
  const value = request.headers.get("authorization");
  let supplied = "";
  try {
    if (value?.startsWith("Basic "))
      supplied = Buffer.from(value.slice(6), "base64").toString("utf8");
  } catch {}
  const expected = Buffer.from(`radar:${token}`),
    candidate = Buffer.from(supplied);
  if (
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  )
    return NextResponse.next();
  return new NextResponse("Kimlik doğrulama gerekli.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="FirsatRadar", charset="UTF-8"',
    },
  });
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
