// Existing webhook / decryption surface - unchanged.
export { decryptWebhookData } from './decrypt'
export { verifyWebhookSignature } from './verify'
export { derivePrivateKey } from './crypto'

// Encryption (the inverse of decryptWebhookData) and key helpers.
export { encryptSubmission, validateEncryptedPayload, encryptFileBlob } from './encrypt'
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
  SubmitFileInput,
  SubmitWithFilesInput,
  SubmitWithFilesResponse,
} from './types'
