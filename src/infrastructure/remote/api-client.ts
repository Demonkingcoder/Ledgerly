export interface ApiProblem {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(readonly problem: ApiProblem) {
    super(problem.message);
    this.name = 'ApiError';
  }
}

/** Typed HTTP boundary for a future authenticated service. It is not enabled by the MVP. */
export class ApiClient {
  constructor(private readonly baseUrl: string, private readonly getAccessToken?: () => Promise<string | null>) {
    if (!baseUrl) throw new Error('A service URL is required to construct the remote API client.');
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken?.();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(new URL(path.replace(/^\//, ''), this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`), { ...init, headers });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { code?: string; message?: string; details?: unknown } | null;
      throw new ApiError({ status: response.status, code: payload?.code ?? 'request_failed', message: payload?.message ?? `The service returned ${response.status}.`, details: payload?.details });
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}
