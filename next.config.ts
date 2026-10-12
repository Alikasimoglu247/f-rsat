import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  experimental: { cpus: 2 },
  logging: { incomingRequests: { ignore: [/\/api\/email\/gmail\/callback/] } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
