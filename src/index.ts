// Existing webhook / decryption surface - unchanged.
export { decryptWebhookData } from './decrypt'
export { verifyWebhookSignature } from './verify'
export { derivePrivateKey } from './crypto'

// Encryption (the inverse of decryptWebhookData) and key helpers.
export { encryptSubmission, validateEncryptedPayload, encryptFileBlob } from './encrypt'

// Prefill-link recipient box + URL helpers (issuer side).
export {
  generatePrefillKey,
  encryptRecipientBox,
  decryptRecipientBox,
  buildPrefillUrl,
} from './prefill'
export type { LockedField, LockedFieldDisplay, PrefillPayload, RecipientBox } from './prefill'
export {
  computeUniqueFieldHash,
  generateBlindIndex,
  normalizeFieldValue,
} from './blind-index'
export type { DuplicateDetectionConfig, UniqueFieldValue } from './blind-index'
export {
  generateMnemonic15Words,
  validateMnemonic15Words,
  deriveKeyPairFromMnemonic,
  exportPublicKeyBase64,
  exportPrivateKeyBase64,
  importPublicKeyBase64,
  importPrivateKeyBase64,
  generateMnemonicAndKeys,
} from './keys'

// REST API client.
export { Lockform } from './client/client'
export type { LockformConfig } from './client/client'
export {
  LockformError,
  LockformAuthError,
  LockformNotFoundError,
  LockformValidationError,
  LockformRateLimitError,
  LockformServerError,
  LockformNetworkError,
} from './client/errors'

// Types.
export type {
  WebhookPayload,
  DecryptedSubmission,
  DecryptWebhookOptions,
  VerifySignatureOptions,
  HealthResponse,
  Paginated,
  Form,
  PublicForm,
  PublicFormSettings,
  FormCreateInput,
  FormUpdateInput,
  FormCloneInput,
  FormCloneResponse,
  FormListOptions,
  FormImageUploadInput,
  FormImageUploadResponse,
  AccessToken,
  AccessTokenCreateInput,
  AccessTokenUpdateInput,
  PrefillLink,
  PrefillLinkCreateInput,
  PrefillLinkUpdateInput,
  PrefillLinkIssueInput,
  PrefillLinkIssueResult,
  Webhook,
  WebhookPutInput,
  WebhookTestResponse,
  Submission,
  SubmissionListOptions,
  SubmissionEnvelope,
  SubmissionFileClaim,
  SubmissionCreateInput,
  SubmissionCreateResponse,
  SubmissionCountResponse,
  SubmissionBulkDeleteResponse,
  PrepareUploadInput,
  PrepareUploadResponse,
  PrepareDownloadResponse,
  EncryptedPayload,
  EncryptSubmissionMetadata,
  FileSubmissionValue,
  SubmitFileInput,
  SubmitWithFilesInput,
  SubmitWithFilesResponse,
} from './types'
