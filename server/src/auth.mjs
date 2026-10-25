import { betterAuth } from 'better-auth';
import { bearer, deviceAuthorization } from 'better-auth/plugins';

export function createAuth(pool, env) {
  const base = env.PUBLIC_URL.replace(/\/$/, '');
  return betterAuth({
    appName: 'Nexlet',
    baseURL: new URL(base).origin,
    basePath: new URL(base).pathname + '/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: pool,
    trustedOrigins: [new URL(base).origin],
    socialProviders:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
              scope: ['read:user', 'user:email'],
            },
          }
        : {},
    account: { encryptOAuthTokens: true },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
    advanced: {
      useSecureCookies: new URL(base).protocol === 'https:',
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
    },
    plugins: [
      bearer(),
      deviceAuthorization({
        verificationUri: base + '/device',
        expiresIn: '15m',
        interval: '5s',
        validateClient: (id) => id === 'nexlet-desktop',
      }),
    ],
  });
}
