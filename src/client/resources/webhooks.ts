import { HttpClient } from '../http'
import { Webhook, WebhookPutInput, WebhookTestResponse } from '../../types'

export class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  async get(formId: string): Promise<{ webhook: Webhook }> {
    return this.http.request<{ webhook: Webhook }>({
      method: 'GET',
      path: `/v1/forms/${encodeURIComponent(formId)}/webhook`,
    })
  }

  async put(formId: string, input: WebhookPutInput): Promise<{ webhook: Webhook }> {
    return this.http.request<{ webhook: Webhook }>({
      method: 'PUT',
      path: `/v1/forms/${encodeURIComponent(formId)}/webhook`,
      body: input,
    })
  }

  async delete(formId: string): Promise<null> {
    return this.http.request<null>({
      method: 'DELETE',
      path: `/v1/forms/${encodeURIComponent(formId)}/webhook`,
    })
  }

  async test(formId: string): Promise<WebhookTestResponse> {
    return this.http.request<WebhookTestResponse>({
      method: 'POST',
      path: `/v1/forms/${encodeURIComponent(formId)}/webhook/test`,
      body: {},
    })
  }
}
