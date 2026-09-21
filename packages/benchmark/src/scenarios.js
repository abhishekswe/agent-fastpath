/**
 * Benchmark scenarios measuring token reduction, latency, and accuracy.
 */
export function createTriageScenario(router) {
    // 20 realistic files representing ~50KB (12,500 tokens)
    const files = [
        { id: 'src/auth/jwt.ts', content: 'export function verifyJwt(token: string) { if (!token) throw new Error("Invalid token signature"); return decode(token); }' },
        { id: 'src/auth/session.ts', content: 'export class SessionStore { private sessions = new Map(); get(id: string) { return this.sessions.get(id); } }' },
        { id: 'src/auth/oauth.ts', content: 'export async function handleOAuthCallback(code: string) { return exchangeCodeForTokens(code); }' },
        { id: 'src/database/client.ts', content: 'export const db = new PostgresPool({ connectionString: process.env.DATABASE_URL });' },
        { id: 'src/database/migrations/001.sql', content: 'CREATE TABLE users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE, password_hash VARCHAR(255));' },
        { id: 'src/database/migrations/002.sql', content: 'CREATE TABLE refresh_tokens (token_id UUID PRIMARY KEY, user_id INT REFERENCES users(id));' },
        { id: 'src/api/routes/users.ts', content: 'router.get("/users/me", requireAuth, async (req, res) => res.json(req.user));' },
        { id: 'src/api/routes/billing.ts', content: 'router.post("/checkout", requireAuth, async (req, res) => res.json({ status: "ok" }));' },
        { id: 'src/api/routes/health.ts', content: 'router.get("/healthz", (req, res) => res.status(200).send("OK"));' },
        { id: 'src/config/env.ts', content: 'export const config = { port: process.env.PORT || 3000, secret: process.env.JWT_SECRET };' },
        { id: 'src/utils/logger.ts', content: 'export const logger = { info: console.log, error: console.error, warn: console.warn };' },
        { id: 'src/utils/crypto.ts', content: 'export function hashPassword(pw: string) { return scryptSync(pw, salt, 64).toString("hex"); }' },
        { id: 'tests/auth.test.ts', content: 'describe("Auth", () => { it("fails on expired token", () => { expect(() => verifyJwt("bad")).toThrow(); }); });' },
        { id: 'tests/user.test.ts', content: 'describe("Users", () => { it("returns user profile", async () => {}); });' },
        { id: 'README.md', content: '# Core Platform\nAuthentication and user management backend services.' },
        { id: 'package.json', content: '{"name": "platform-api", "version": "1.0.0", "dependencies": {"jsonwebtoken": "^9.0.0"}}' },
        { id: 'Dockerfile', content: 'FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "dist/index.js"]' },
        { id: 'docker-compose.yml', content: 'version: "3.8"\nservices:\n  db:\n    image: postgres:15\n  app:\n    build: .' },
        { id: 'tsconfig.json', content: '{"compilerOptions": {"target": "ES2022", "module": "NodeNext"}}' },
        { id: '.env.example', content: 'DATABASE_URL=postgres://localhost:5432/db\nJWT_SECRET=supersecret' }
    ];
    const rawState = JSON.stringify(files);
    return {
        id: 'repo-triage',
        name: 'Repository File Triage',
        description: 'Find relevant files for fixing JWT token verification failure without putting all 20 files into host LLM context.',
        rawInput: rawState,
        runFastpath: async () => {
            const start = Date.now();
            const res = await router.evaluate({
                state: `Target Query: "Fix JWT signature verification failure on expired tokens"\nFiles:\n${files.map(f => `${f.id}: ${f.content}`).join('\n')}`,
                preset: 'relevance',
                presetParams: { query: 'JWT signature verification' }
            });
            const latencyMs = Date.now() - start;
            return {
                compactOutput: res,
                latencyMs,
                tokensSaved: res.metrics.estimatedTokensSaved,
                success: res.status === 'accept'
            };
        }
    };
}
export function createShipGateScenario(router) {
    const ciLogs = `
    === RUNNING TEST SUITE ===
    ✓ tests/unit/auth.test.ts (14 tests passed)
    ✓ tests/unit/router.test.ts (8 tests passed)
    ✓ tests/integration/api.test.ts (22 tests passed)
    ✓ tests/security/ssrf.test.ts (5 tests passed)
    
    Test Suites: 4 passed, 4 total
    Tests:       49 passed, 0 failed
    Snapshots:   0 total
    Time:        2.341 s
    
    === GIT DIFF (HEAD~1) ===
    diff --git a/src/auth/jwt.ts b/src/auth/jwt.ts
    index 8a1f2b..9b2e3c 100644
    --- a/src/auth/jwt.ts
    +++ b/src/auth/jwt.ts
    @@ -10,4 +10,4 @@
    -  return decode(token);
    +  return verify(token, process.env.JWT_SECRET);
  `;
    return {
        id: 'ci-ship-gate',
        name: 'CI Verification & Ship Gate',
        description: 'Evaluate test run logs and git diff for readiness to ship/merge using deterministic & System One checks.',
        rawInput: ciLogs,
        runFastpath: async () => {
            const start = Date.now();
            const res = await router.evaluate({
                state: ciLogs,
                preset: 'ship_gate'
            });
            const latencyMs = Date.now() - start;
            return {
                compactOutput: res,
                latencyMs,
                tokensSaved: res.metrics.estimatedTokensSaved,
                success: res.decision === 'READY_TO_SHIP'
            };
        }
    };
}
//# sourceMappingURL=scenarios.js.map