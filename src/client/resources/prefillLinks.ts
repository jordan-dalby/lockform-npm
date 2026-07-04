import { HttpClient } from "../http";
import {
  PrefillLink,
  PrefillLinkCreateInput,
  PrefillLinkIssueInput,
  PrefillLinkIssueResult,
  PrefillLinkUpdateInput,
  PublicForm,
} from "../../types";
import { encryptSubmission } from "../../encrypt";
import {
  buildPrefillUrl,
  encryptRecipientBox,
  generatePrefillKey,
  PrefillPayload,
} from "../../prefill";

export class PrefillLinksResource {
  constructor(private readonly http: HttpClient) {}

  async list(formId: string): Promise<{ data: PrefillLink[] }> {
    return this.http.request<{ data: PrefillLink[] }>({
      method: "GET",
      path: `/v1/forms/${encodeURIComponent(formId)}/prefill-links`,
    });
  }

  /**
   * Create a prefill link from an already-built double-envelope. Most callers
   * should prefer `issue()`, which does the encryption. The plaintext `token`
   * is returned exactly once.
   */
  async create(
    formId: string,
    input: PrefillLinkCreateInput,
  ): Promise<{ prefill_link: PrefillLink }> {
    return this.http.request<{ prefill_link: PrefillLink }>({
      method: "POST",
      path: `/v1/forms/${encodeURIComponent(formId)}/prefill-links`,
      body: input,
    });
  }

  async update(
    formId: string,
    linkId: string,
    input: PrefillLinkUpdateInput,
  ): Promise<{ prefill_link: PrefillLink }> {
    return this.http.request<{ prefill_link: PrefillLink }>({
      method: "PATCH",
      path: `/v1/forms/${encodeURIComponent(formId)}/prefill-links/${encodeURIComponent(linkId)}`,
      body: input,
    });
  }

  async delete(formId: string, linkId: string): Promise<null> {
    return this.http.request<null>({
      method: "DELETE",
      path: `/v1/forms/${encodeURIComponent(formId)}/prefill-links/${encodeURIComponent(linkId)}`,
    });
  }

  /**
   * End-to-end issue helper: generates the per-link key K, encrypts
   * `{ values, lockedFields }` into both the recipient box (AES-256-GCM under K)
   * and the authoritative box (X25519 envelope sealed to the form key), creates
   * the link, and returns the token, K, and - when `formUrl` + `accessToken`
   * are supplied - the ready-to-send recipient URL.
   *
   * The server never receives K or plaintext. Provide `publicKey` directly, or
   * an `accessToken` so the helper can fetch it from the public form endpoint.
   */
  async issue(
    formId: string,
    input: PrefillLinkIssueInput,
  ): Promise<PrefillLinkIssueResult> {
    const publicKey = await this.resolvePublicKey(formId, input);

    const payload: PrefillPayload = {
      values: input.values,
      lockedFields: input.lockedFields ?? [],
    };

    const key = generatePrefillKey();
    const recipientBox = await encryptRecipientBox(payload, key);

    const timestamp = Date.now();
    const authoritative = await encryptSubmission(payload, publicKey, {
      formId,
      timestamp,
    });

    const createInput: PrefillLinkCreateInput = {
      recipient_ciphertext: recipientBox.recipient_ciphertext,
      recipient_iv: recipientBox.recipient_iv,
      ciphertext: authoritative.ciphertext,
      iv: authoritative.iv,
      salt: authoritative.salt,
      ephemeral_public_key: authoritative.ephemeralPublicKey,
      algorithm: authoritative.algorithm,
      encryption_timestamp: authoritative.timestamp,
      label: input.label ?? undefined,
      single_use: input.singleUse ?? undefined,
      expires_at: input.expiresAt ?? undefined,
    };

    const { prefill_link } = await this.create(formId, createInput);
    const token = prefill_link.token;
    if (!token) {
      throw new Error("Prefill link create response did not include a token");
    }

    const url =
      input.formUrl && input.accessToken
        ? buildPrefillUrl({
            formUrl: input.formUrl,
            accessToken: input.accessToken,
            prefillToken: token,
            key,
          })
        : null;

    return { prefill_link, prefill_token: token, key, url };
  }

  private async resolvePublicKey(
    formId: string,
    input: PrefillLinkIssueInput,
  ): Promise<string> {
    if (input.publicKey) return input.publicKey;
    if (!input.accessToken) {
      throw new Error(
        "prefillLinks.issue requires either `publicKey` or `accessToken` to seal the authoritative envelope.",
      );
    }
    const publicForm = await this.http.request<PublicForm>({
      method: "GET",
      path: `/v1/forms/${encodeURIComponent(formId)}/public`,
      query: { token: input.accessToken },
      skipAuth: true,
    });
    return publicForm.public_key;
  }
}
