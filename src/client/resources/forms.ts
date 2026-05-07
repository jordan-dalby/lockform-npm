import { HttpClient } from '../http'
import {
  Form,
  FormCloneInput,
  FormCloneResponse,
  FormCreateInput,
  FormImageUploadInput,
  FormImageUploadResponse,
  FormListOptions,
  FormUpdateInput,
  Paginated,
} from '../../types'

export class FormImagesResource {
  constructor(private readonly http: HttpClient) {}

  async upload(input: FormImageUploadInput): Promise<FormImageUploadResponse> {
    const blob =
      input.file instanceof Uint8Array
        ? new Blob([toArrayBuffer(input.file)], { type: input.contentType })
        : input.file
    const form = new FormData()
    form.append('file', blob, input.filename ?? 'image')
    return this.http.request<FormImageUploadResponse>({
      method: 'POST',
      path: '/v1/forms/images',
      multipart: form,
    })
  }

  async delete(path: string): Promise<null> {
    const encoded = path.split('/').map(encodeURIComponent).join('/')
    return this.http.request<null>({
      method: 'DELETE',
      path: `/v1/forms/images/${encoded}`,
    })
  }
}

export class FormsResource {
  readonly images: FormImagesResource

  constructor(private readonly http: HttpClient) {
    this.images = new FormImagesResource(http)
  }

  async list(options: FormListOptions = {}): Promise<Paginated<Form>> {
    return this.http.request<Paginated<Form>>({
      method: 'GET',
      path: '/v1/forms',
      query: { limit: options.limit, cursor: options.cursor },
    })
  }

  async create(input: FormCreateInput): Promise<{ form: Form }> {
    return this.http.request<{ form: Form }>({
      method: 'POST',
      path: '/v1/forms',
      body: input,
    })
  }

  async get(formId: string): Promise<{ form: Form }> {
    return this.http.request<{ form: Form }>({
      method: 'GET',
      path: `/v1/forms/${encodeURIComponent(formId)}`,
    })
  }

  async update(formId: string, input: FormUpdateInput): Promise<{ form: Form }> {
    return this.http.request<{ form: Form }>({
      method: 'PATCH',
      path: `/v1/forms/${encodeURIComponent(formId)}`,
      body: input,
    })
  }

  async delete(formId: string): Promise<null> {
    return this.http.request<null>({
      method: 'DELETE',
      path: `/v1/forms/${encodeURIComponent(formId)}`,
    })
  }

  async clone(formId: string, input: FormCloneInput = {}): Promise<FormCloneResponse> {
    return this.http.request<FormCloneResponse>({
      method: 'POST',
      path: `/v1/forms/${encodeURIComponent(formId)}/clone`,
      body: input,
    })
  }

  async *iterate(options: FormListOptions = {}): AsyncIterable<Form> {
    let cursor = options.cursor
    while (true) {
      const page: Paginated<Form> = await this.list({ ...options, cursor })
      for (const form of page.data) yield form
      if (!page.next_cursor) return
      cursor = page.next_cursor
    }
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Uint8Array's underlying buffer may be a SharedArrayBuffer or larger than
  // the view; copy into a fresh ArrayBuffer so the Blob constructor is happy
  // regardless of the input shape.
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
