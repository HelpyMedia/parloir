import { createAuthClient } from "better-auth/react";

// No baseURL: requests go to the origin the page was loaded from. Pinning it
// to NEXT_PUBLIC_APP_URL made every other hostname (the *.vercel.app URLs)
// send auth calls cross-origin, which the CSP blocks.
export const authClient = createAuthClient();
