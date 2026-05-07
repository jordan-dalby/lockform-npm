import { HttpClient } from '../http'
import {
  AccessToken,
  AccessTokenCreateInput,
  AccessTokenUpdateInput,
} from '../../types'

export class AccessTokensResource {
  constructor(private readonly http: HttpClient) {}

  async list(formId: string): Promise<{ data: AccessToken[] }> {
    return this.http.request<{ data: AccessToken[] }>({
      method: 'GET',
      path: `/v1/forms/${encodeURIComponent(formId)}/access-tokens`,
    })
  }

  async create(
    formId: string,
    input: AccessTokenCreateInput = {}
  ): Promise<{ access_token: AccessToken }> {
    return this.http.request<{ access_token: AccessToken }>({
      method: 'POST',
      path: `/v1/forms/${encodeURIComponent(formId)}/access-tokens`,
      body: input,
    })
  }

  async update(
    formId: string,
    tokenId: string,
    input: AccessTokenUpdateInput
  ): Promise<{ access_token: AccessToken }> {
    return this.http.request<{ access_token: AccessToken }>({
      method: 'PATCH',
      path: `/v1/forms/${encodeURIComponent(formId)}/access-tokens/${encodeURIComponent(tokenId)}`,
      body: input,
    })
  }

  async delete(formId: string, tokenId: string): Promise<null> {
    return this.http.request<null>({
      method: 'DELETE',
      path: `/v1/forms/${encodeURIComponent(formId)}/access-tokens/${encodeURIComponent(tokenId)}`,
    })
  }
}
