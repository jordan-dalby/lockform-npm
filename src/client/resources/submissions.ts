import { HttpClient } from '../http'
import {
  Paginated,
  Submission,
  SubmissionBulkDeleteResponse,
  SubmissionCountResponse,
  SubmissionEnvelope,
  SubmissionListOptions,
} from '../../types'

export class SubmissionsResource {
  constructor(private readonly http: HttpClient) {}

  async list(
    formId: string,
    options: SubmissionListOptions = {}
  ): Promise<Paginated<Submission>> {
    return this.http.request<Paginated<Submission>>({
      method: 'GET',
      path: `/v1/forms/${encodeURIComponent(formId)}/submissions`,
      query: {
        limit: options.limit,
        cursor: options.cursor,
        from: options.from,
        to: options.to,
      },
    })
  }

  async count(formId: string): Promise<SubmissionCountResponse> {
    return this.http.request<SubmissionCountResponse>({
      method: 'GET',
      path: `/v1/forms/${encodeURIComponent(formId)}/submissions/count`,
    })
  }

  async deleteAll(formId: string): Promise<SubmissionBulkDeleteResponse> {
    return this.http.request<SubmissionBulkDeleteResponse>({
      method: 'DELETE',
      path: `/v1/forms/${encodeURIComponent(formId)}/submissions`,
    })
  }

  async get(submissionId: string): Promise<{ submission: Submission }> {
    return this.http.request<{ submission: Submission }>({
      method: 'GET',
      path: `/v1/submissions/${encodeURIComponent(submissionId)}`,
    })
  }

  async update(
    submissionId: string,
    envelope: SubmissionEnvelope
  ): Promise<{ submission: Submission }> {
    return this.http.request<{ submission: Submission }>({
      method: 'PATCH',
      path: `/v1/submissions/${encodeURIComponent(submissionId)}`,
      body: envelope,
    })
  }

  async delete(submissionId: string): Promise<null> {
    return this.http.request<null>({
      method: 'DELETE',
      path: `/v1/submissions/${encodeURIComponent(submissionId)}`,
    })
  }

  async *iterate(
    formId: string,
    options: SubmissionListOptions = {}
  ): AsyncIterable<Submission> {
    let cursor = options.cursor
    while (true) {
      const page: Paginated<Submission> = await this.list(formId, { ...options, cursor })
      for (const submission of page.data) yield submission
      if (!page.next_cursor) return
      cursor = page.next_cursor
    }
  }
}
