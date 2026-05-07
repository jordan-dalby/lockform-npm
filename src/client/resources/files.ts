import { HttpClient } from '../http'
import { PrepareDownloadResponse } from '../../types'

export class FilesResource {
  constructor(private readonly http: HttpClient) {}

  async prepareDownload(
    submissionId: string,
    storagePath: string
  ): Promise<PrepareDownloadResponse> {
    return this.http.request<PrepareDownloadResponse>({
      method: 'POST',
      path: `/v1/submissions/${encodeURIComponent(submissionId)}/files/prepare-download`,
      body: { storage_path: storagePath },
    })
  }
}
