import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // Override vars so the Clerk dev-bypass is never triggered in tests.
          // CLERK_JWKS_URL being present means requireAuth() always demands a real JWT.
          bindings: {
            ENVIRONMENT: 'test',
            CLERK_JWKS_URL: 'https://test.clerk.example.com/.well-known/jwks.json',
            CLERK_ISSUER: 'https://test.clerk.example.com',
            HMAC_SECRET: 'test-hmac-secret-32-bytes-padding!!',
          },
        },
      },
    },
  },
})
