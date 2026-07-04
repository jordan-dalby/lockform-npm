import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Lockform,
  LockformValidationError,
  generateMnemonicAndKeys,
  exportPublicKeyBase64,
  generatePrefillKey,
  encryptRecipientBox,
  decryptRecipientBox,
  buildPrefillUrl,
} from "../dist/index.js";
import { makeFetch, parseBody, pathOf, extractQuery } from "./helpers.mjs";

const ALGORITHM = "X25519+AES-256-GCM";

function makePublicKey() {
  const { publicKey } = generateMnemonicAndKeys();
  return exportPublicKeyBase64(publicKey);
}

test("prefillLinks.list - GET .../prefill-links", async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { data: [{ id: "pl1" }] } },
  ]);
  const lf = new Lockform({ apiKey: "lf_x", fetch });
  const out = await lf.prefillLinks.list("f1");
  assert.equal(calls[0].method, "GET");
  assert.equal(pathOf(calls[0].url), "/v1/forms/f1/prefill-links");
  assert.equal(out.data[0].id, "pl1");
});

test("prefillLinks.create - POST .../prefill-links, returns plaintext token", async () => {
  const { fetch, calls } = makeFetch([
    {
      status: 201,
      body: { prefill_link: { id: "pl1", form_id: "f1", token: "p_secret" } },
    },
  ]);
  const lf = new Lockform({ apiKey: "lf_x", fetch });
  const body = {
    recipient_ciphertext: "rc",
    recipient_iv: "ri",
    ciphertext: "c",
    iv: "i",
    salt: "s",
    ephemeral_public_key: "e",
    algorithm: ALGORITHM,
    encryption_timestamp: 123,
  };
  const out = await lf.prefillLinks.create("f1", body);
  assert.equal(calls[0].method, "POST");
  assert.equal(pathOf(calls[0].url), "/v1/forms/f1/prefill-links");
  assert.deepEqual(parseBody(calls[0]), body);
  assert.equal(out.prefill_link.token, "p_secret");
});

test("prefillLinks.update - PATCH .../prefill-links/:id", async () => {
  const { fetch, calls } = makeFetch([
    { status: 200, body: { prefill_link: { id: "pl1" } } },
  ]);
  const lf = new Lockform({ apiKey: "lf_x", fetch });
  await lf.prefillLinks.update("f1", "pl1", { is_active: false });
  assert.equal(calls[0].method, "PATCH");
  assert.equal(pathOf(calls[0].url), "/v1/forms/f1/prefill-links/pl1");
  assert.deepEqual(parseBody(calls[0]), { is_active: false });
});

test("prefillLinks.delete - DELETE .../prefill-links/:id returns null", async () => {
  const { fetch, calls } = makeFetch([{ status: 204 }]);
  const lf = new Lockform({ apiKey: "lf_x", fetch });
  const out = await lf.prefillLinks.delete("f1", "pl1");
  assert.equal(calls[0].method, "DELETE");
  assert.equal(pathOf(calls[0].url), "/v1/forms/f1/prefill-links/pl1");
  assert.equal(out, null);
});

test("prefillLinks.create - 400 maps to LockformValidationError", async () => {
  const { fetch } = makeFetch([
    { status: 400, body: { error: "Invalid request" } },
  ]);
  const lf = new Lockform({ apiKey: "lf_x", fetch });
  await assert.rejects(
    () =>
      lf.prefillLinks.create("f1", {
        recipient_ciphertext: "x",
        recipient_iv: "x",
        ciphertext: "x",
        iv: "x",
        salt: "x",
        ephemeral_public_key: "x",
        algorithm: ALGORITHM,
        encryption_timestamp: 1,
      }),
    LockformValidationError,
  );
});

test("prefillLinks.issue - encrypts both boxes with a supplied publicKey and POSTs", async () => {
  const publicKey = makePublicKey();
  const { fetch, calls } = makeFetch([
    {
      status: 201,
      body: { prefill_link: { id: "pl1", form_id: "f1", token: "p_secret" } },
    },
  ]);
  const lf = new Lockform({ apiKey: "lf_x", fetch });

  const result = await lf.prefillLinks.issue("f1", {
    values: { fld_amount: "250.00", fld_uid: "u_123" },
    lockedFields: [
      { id: "fld_amount", display: "readonly" },
      { id: "fld_uid", display: "hidden" },
    ],
    publicKey,
    label: "user-42",
    singleUse: true,
    formUrl: "https://app.lockform.io/f/f1",
    accessToken: "acc_tok",
  });

  // Only the create call - publicKey supplied means no public-form fetch.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(pathOf(calls[0].url), "/v1/forms/f1/prefill-links");

  const body = parseBody(calls[0]);
  assert.equal(body.algorithm, ALGORITHM);
  assert.equal(typeof body.encryption_timestamp, "number");
  assert.equal(body.label, "user-42");
  assert.equal(body.single_use, true);
  for (const k of [
    "recipient_ciphertext",
    "recipient_iv",
    "ciphertext",
    "iv",
    "salt",
    "ephemeral_public_key",
  ]) {
    assert.equal(typeof body[k], "string", `expected ${k} in create body`);
  }
  // Recipient box and authoritative box are distinct ciphertexts.
  assert.notEqual(body.recipient_ciphertext, body.ciphertext);

  assert.equal(result.prefill_token, "p_secret");
  assert.match(result.key, /^[A-Za-z0-9_-]+$/);
  assert.equal(
    result.url,
    `https://app.lockform.io/f/f1?token=acc_tok&p=p_secret#k=${result.key}`,
  );

  // The recipient box decrypts with the returned key back to the payload.
  const payload = await decryptRecipientBox(
    body.recipient_ciphertext,
    body.recipient_iv,
    result.key,
  );
  assert.deepEqual(payload.values, { fld_amount: "250.00", fld_uid: "u_123" });
  assert.deepEqual(payload.lockedFields, [
    { id: "fld_amount", display: "readonly" },
    { id: "fld_uid", display: "hidden" },
  ]);
});

test("prefillLinks.issue - fetches the public key via accessToken when publicKey omitted", async () => {
  const publicKey = makePublicKey();
  const { fetch, calls } = makeFetch([
    {
      status: 200,
      body: { form: { id: "f1" }, public_key: publicKey, algorithm: ALGORITHM },
    },
    {
      status: 201,
      body: { prefill_link: { id: "pl1", form_id: "f1", token: "p_secret" } },
    },
  ]);
  const lf = new Lockform({ apiKey: "lf_x", fetch });

  const result = await lf.prefillLinks.issue("f1", {
    values: { a: "1" },
    accessToken: "acc_tok",
  });

  assert.equal(calls.length, 2);
  assert.equal(pathOf(calls[0].url), "/v1/forms/f1/public");
  assert.equal(extractQuery(calls[0].url).token, "acc_tok");
  assert.equal(pathOf(calls[1].url), "/v1/forms/f1/prefill-links");
  assert.equal(result.prefill_token, "p_secret");
  // No formUrl provided → no URL built.
  assert.equal(result.url, null);
});

test("prefillLinks.issue - throws when neither publicKey nor accessToken is given", async () => {
  const { fetch } = makeFetch([]);
  const lf = new Lockform({ apiKey: "lf_x", fetch });
  await assert.rejects(
    () => lf.prefillLinks.issue("f1", { values: { a: "1" } }),
    /publicKey.*accessToken/,
  );
});

test("recipient box - roundtrip and wrong-key rejection", async () => {
  const key = generatePrefillKey();
  const payload = {
    values: { x: "1" },
    lockedFields: [{ id: "x", display: "readonly" }],
  };
  const box = await encryptRecipientBox(payload, key);
  const back = await decryptRecipientBox(
    box.recipient_ciphertext,
    box.recipient_iv,
    key,
  );
  assert.deepEqual(back, payload);
  await assert.rejects(() =>
    decryptRecipientBox(
      box.recipient_ciphertext,
      box.recipient_iv,
      generatePrefillKey(),
    ),
  );
});

test("buildPrefillUrl - appends & when formUrl already has a query", () => {
  const url = buildPrefillUrl({
    formUrl: "https://app.lockform.io/f/f1?foo=bar",
    accessToken: "acc",
    prefillToken: "p",
    key: "KEY",
  });
  assert.equal(url, "https://app.lockform.io/f/f1?foo=bar&token=acc&p=p#k=KEY");
});
