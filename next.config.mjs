// Origins allowed to frame /embed. Keep this list HERE, in git -- not in the
// Caddyfile -- so a change is reviewed, deployed and revertable like any other
// code change. Adding a partner means adding an origin here and nothing else.
const EMBED_FRAME_ANCESTORS = ["https://ikargos.com", "https://www.ikargos.com"];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // ONLY /embed is framable. Every other path keeps the reverse proxy's
    // blanket X-Frame-Options: SAMEORIGIN, so /admin in particular cannot be
    // clickjacked into a hostile page.
    //
    // This header alone is NOT sufficient in production: Caddy adds SAMEORIGIN
    // to every response, and while CSP frame-ancestors takes precedence over
    // X-Frame-Options in current browsers, relying on that alone is a thin
    // margin for a partner-facing page. The matching Caddy change -- stop
    // sending XFO on /embed only -- ships with this; see DEPLOY.md.
    const frameAncestors = [
      {
        key: "Content-Security-Policy",
        value: `frame-ancestors ${EMBED_FRAME_ANCESTORS.join(" ")}`,
      },
    ];
    return [
      { source: "/embed", headers: frameAncestors },
      { source: "/embed/:path*", headers: frameAncestors },
    ];
  },
};
export default nextConfig;
