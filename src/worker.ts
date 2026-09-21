// Cloudflare Workers entry. Files under dist/client are served by the
// assets binding before this handler runs (assets-first routing); every
// other request goes to the built Solid server bundle — SSR pages plus the
// server-function endpoint.
import server from "../dist/server/server.js";

export default {
  fetch(request: Request) {
    return server.fetch(request);
  },
};
