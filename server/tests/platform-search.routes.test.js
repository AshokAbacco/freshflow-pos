/*
 * The universal search route: who may see what, and what a short or hostile term does.
 *
 * The SQL itself is covered by store-directory.test.js against a real database. What is left
 * here is the part that is easy to get wrong in a route: the role redaction, and whether the
 * total still adds up once something has been redacted.
 *
 *   node --test --experimental-test-module-mocks tests/platform-search.routes.test.js
 */
import assert from "node:assert/strict";
import http from "node:http";
import test, { after, before, mock } from "node:test";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-jwt-secret-that-is-definitely-long-enough-32";
process.env.DATABASE_URL ||= "postgresql://postgres@127.0.0.1:5433/freshflow";
process.env.RAZORPAY_KEY_ID ||= "rzp_test_1234567890abcd";
process.env.RAZORPAY_KEY_SECRET ||= "testsecretvaluewithnoprefix1234";
process.env.RAZORPAY_WEBHOOK_SECRET ||= "testwebhooksecretvaluelongenough";

const admins = {
  "sess-super": {
    id: "adm-super",
    name: "Super",
    email: "super@ff.test",
    role: "SUPER_ADMIN",
    isActive: true,
    totpEnabled: false,
  },
  "sess-support": {
    id: "adm-support",
    name: "Support",
    email: "support@ff.test",
    role: "SUPPORT",
    isActive: true,
    totpEnabled: false,
  },
  "sess-finance": {
    id: "adm-finance",
    name: "Finance",
    email: "finance@ff.test",
    role: "FINANCE",
    isActive: true,
    totpEnabled: false,
  },
};

/** Records what SQL the search issued, so the phone branch can be asserted on. */
const issued = [];

const fakePrisma = {
  platformSession: {
    findUnique: async ({ where }) => {
      const admin = admins[where.id];
      if (!admin) return null;
      return {
        id: where.id,
        adminId: admin.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        admin,
      };
    },
  },
  $queryRawUnsafe: async (sql, ...params) => {
    issued.push({ sql, params });
    if (/FROM organizations/.test(sql))
      return [
        {
          id: "org-1",
          name: "Sri Lakshmi Stores",
          city: "Bengaluru",
          business_type: "KIRANA",
        },
      ];
    if (/FROM users/.test(sql))
      return [
        {
          id: "u-1",
          name: "Ravi",
          email: "ravi@x.test",
          phone: "+91 98765 43210",
          role: "ADMIN",
          organization_id: "org-1",
          organization_name: "Sri Lakshmi Stores",
        },
      ];
    if (/FROM payments/.test(sql))
      return [
        {
          id: "pay-1",
          razorpay_order_id: "order_ABC123",
          razorpay_payment_id: "pay_XYZ789",
          amount: "1950.00",
          currency: "INR",
          status: "PAID",
          created_at: new Date(),
          organization_id: "org-1",
          organization_name: "Sri Lakshmi Stores",
        },
      ];
    return [];
  },
};

let server;
let base;
let signToken;

before(async () => {
  mock.module("../src/lib/prisma.js", { namedExports: { prisma: fakePrisma } });

  const express = (await import("express")).default;
  const searchRoutes = (await import("../src/routes/platform/search.routes.js"))
    .default;
  const { signPlatformAccessToken } =
    await import("../src/services/platform-auth.service.js");
  signToken = (s) => signPlatformAccessToken(admins[s], s);

  const app = express();
  app.use(express.json());
  app.use("/api/v1/platform/search", searchRoutes);
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.name === "ZodError" ? 400 : 500);
    res
      .status(status)
      .json({ error: { code: err.code || "ERROR", message: err.message } });
  });

  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/api/v1/platform/search`;
});

after(() => new Promise((r) => (server ? server.close(r) : r())));

async function search(qs, session = "sess-super") {
  issued.length = 0;
  const res = await fetch(`${base}${qs}`, {
    headers: { authorization: `Bearer ${signToken(session)}` },
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test("a search needs authentication", async () => {
  const res = await fetch(`${base}?q=lakshmi`);
  assert.equal(res.status, 401);
});

test("a term under two characters is refused rather than scanning everything", async () => {
  const res = await search("?q=a");
  assert.equal(res.status, 400);
  assert.equal(issued.length, 0, "nothing reached the database");
});

test("a missing term is refused", async () => {
  assert.equal((await search("")).status, 400);
});

test("a super admin gets stores, people and payments", async () => {
  const res = await search("?q=lakshmi");
  assert.equal(res.status, 200);
  assert.equal(res.json.stores.length, 1);
  assert.equal(res.json.users.length, 1);
  assert.equal(res.json.payments.length, 1);
  assert.equal(res.json.total, 3);
  assert.equal(res.json.query, "lakshmi");
});

test("finance sees payment references", async () => {
  const res = await search("?q=order_ABC", "sess-finance");
  assert.equal(res.json.payments.length, 1);
  assert.equal(res.json.payments[0].orderId, "order_ABC123");
  assert.equal(
    typeof res.json.payments[0].amount,
    "number",
    "decimal came back as a number",
  );
});

test("support sees stores and people but no payment references", async () => {
  const res = await search("?q=lakshmi", "sess-support");
  assert.equal(res.status, 200);
  assert.equal(res.json.stores.length, 1, "still useful for a support call");
  assert.equal(res.json.users.length, 1);
  assert.deepEqual(res.json.payments, [], "the payment rail is redacted");
  assert.equal(
    res.json.total,
    2,
    "the total reflects what was actually returned",
  );
});

test("a phone-shaped term searches on digits, a word-shaped one does not", async () => {
  await search("?q=98765 43210");
  const userSql = issued.find((i) => /FROM users/.test(i.sql));
  assert.match(
    userSql.sql,
    /RIGHT\(REGEXP_REPLACE/,
    "the digits branch was used",
  );
  assert.ok(
    userSql.params.includes("%9876543210"),
    "matched on the last ten digits",
  );

  await search("?q=ravi");
  const wordSql = issued.find((i) => /FROM users/.test(i.sql));
  assert.doesNotMatch(
    wordSql.sql,
    /RIGHT\(REGEXP_REPLACE/,
    "no digit matching for a name",
  );
});

test("a term with SQL in it is passed as a parameter, never interpolated", async () => {
  const nasty = "'; DROP TABLE users; --";
  const res = await search(`?q=${encodeURIComponent(nasty)}`);
  assert.equal(res.status, 200);
  for (const { sql, params } of issued) {
    assert.doesNotMatch(
      sql,
      /DROP TABLE/,
      "the term never reached the SQL text",
    );
    assert.ok(
      params.some((p) => String(p).includes("DROP TABLE")),
      "it travelled as a parameter",
    );
  }
});

test("the limit is clamped rather than trusted", async () => {
  assert.equal(
    (await search("?q=lakshmi&limit=500")).status,
    400,
    "an absurd limit is refused",
  );
  assert.equal((await search("?q=lakshmi&limit=0")).status, 400);

  await search("?q=lakshmi&limit=3");
  const storeSql = issued.find((i) => /FROM organizations/.test(i.sql));
  assert.ok(storeSql.params.includes(3), "the asked-for limit was used");
});
