// ============================================================
// API Client Utility
// - Handles JWT tokens (localStorage fallback)
// - Provides typed request/response methods
// ============================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  rateLimited?: boolean;
  retryAfterMs?: number;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

class ApiClient {
  private baseUrl: string;

  // In-flight request deduplication map (keyed by method + endpoint + body)
  private inflight = new Map<string, Promise<ApiResponse<any>>>();
  // Client-side rate-limit cooldown: timestamp until which requests are suppressed
  private rateLimitUntil = 0;
  // How long to suppress requests after receiving a 429 (ms)
  private static readonly RATE_LIMIT_COOLDOWN_MS = 10000;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refreshToken');
  }

  private setTokens(accessToken: string, refreshToken?: string): void {
    localStorage.setItem('accessToken', accessToken);
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
  }

  clearTokens(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Client-side cooldown: if we recently received a 429, short-circuit
    // so we don't keep hammering the server and trigger the limiter again.
    const remainingCooldown = this.rateLimitUntil - Date.now();
    if (remainingCooldown > 0) {
      return {
        success: false,
        error: 'Too many requests, please try again later.',
        rateLimited: true,
        retryAfterMs: remainingCooldown,
      } as ApiResponse<T>;
    }

    const method = options.method || 'GET';
    const body = options.body ? String(options.body) : '';
    // Deduplicate identical concurrent requests so we never fire the same
    // GET/POST more than once at a time (keyed by method + endpoint + body).
    const cacheKey = `${method}:${endpoint}:${body}`;
    if (this.inflight.has(cacheKey)) {
      return this.inflight.get(cacheKey) as Promise<ApiResponse<T>>;
    }

    const promise = this.doFetch<T>(endpoint, options, headers, cacheKey);
    this.inflight.set(cacheKey, promise);
    return promise;
  }

  private async doFetch<T>(
    endpoint: string,
    options: RequestInit,
    headers: Record<string, string>,
    cacheKey: string
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      // 429 — rate limited. Record a cooldown so the UI can show a message
      // and we suppress repeated identical calls for a short window.
      if (response.status === 429) {
        this.rateLimitUntil = Date.now() + ApiClient.RATE_LIMIT_COOLDOWN_MS;
        let data: ApiResponse<T>;
        try {
          data = await response.json();
        } catch {
          data = {} as ApiResponse<T>;
        }
        return {
          ...data,
          success: false,
          rateLimited: true,
          retryAfterMs: ApiClient.RATE_LIMIT_COOLDOWN_MS,
          error: data.error || 'Too many requests, please try again later.',
        } as ApiResponse<T>;
      }

      let data: ApiResponse<T>;
      try {
        data = await response.json();
      } catch {
        data = { success: false, error: 'Unexpected server response' } as ApiResponse<T>;
      }

      // If unauthorized, try refresh token
      if (response.status === 401 && this.getRefreshToken()) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.getToken()}`;
          const retryResponse = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers,
          });
          try {
            return await retryResponse.json();
          } catch {
            return { success: false, error: 'Unexpected server response' } as ApiResponse<T>;
          }
        }
        // Refresh failed
        this.clearTokens();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
      }

      return data;
    } finally {
      this.inflight.delete(cacheKey);
    }
  }

  async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) return false;

      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      const data = await response.json();
      if (data.success && data.data) {
        this.setTokens(data.data.accessToken, data.data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async login(identifier: string, password: string): Promise<ApiResponse<{ user: any; accessToken: string; refreshToken: string }>> {
    const response = await this.request<{ user: any; accessToken: string; refreshToken: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      }
    );

    if (response.success && response.data) {
      this.setTokens(response.data.accessToken, response.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }

    return response;
  }

async register(data: {
    firstName: string;
    lastName: string;
    libraryId: string;
    email: string;
    password: string;
    role?: string;
    department?: string;
    yearSection?: string;
    phone?: string;
  }): Promise<ApiResponse<any>> {
const response = await this.request<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    // Do NOT store tokens after registration. The user must log in
    // manually with their new credentials on the login page.
    return response;
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore errors
    }
    this.clearTokens();
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint);
  }

  // Multipart upload (e-book file + optional cover image). Bypasses the
  // JSON request pipeline since FormData needs the browser to set its own
  // Content-Type header (with the multipart boundary) — setting it manually
  // breaks the upload.
  async uploadEBook(formData: FormData): Promise<ApiResponse<any>> {
    return this.uploadMultipart('/ebooks/upload', formData);
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Auth-specific endpoints
  async getMe(): Promise<ApiResponse<any>> {
    return this.get('/auth/me');
  }

  // Books
  async getBooks(params?: Record<string, string>): Promise<ApiResponse<any[]>> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/books${query}`);
  }

  async getBook(id: string): Promise<ApiResponse<any>> {
    return this.get(`/books/${id}`);
  }

  async createBook(data: {
    isbn: string;
    accessionNo: string;
    title: string;
    author: string;
    publisher?: string;
    publishYear?: number;
    edition?: string;
    pages?: number;
    categoryId?: string;
    description?: string;
    coverImage?: string;
    language?: string;
    shelf?: string;
    row?: string;
    copies?: number;
  }): Promise<ApiResponse<any>> {
    return this.post('/books', data);
  }

  // Multipart create: same fields as createBook, but with an actual cover
  // image file instead of/alongside a coverImage URL. Uses the same
  // no-Content-Type-header pattern as uploadEBook.
  async createBookWithCoverFile(fields: Record<string, string>, coverFile: File): Promise<ApiResponse<any>> {
    const fd = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== '') fd.append(key, value);
    });
    fd.append('coverImage', coverFile);
    return this.uploadMultipart('/books', fd);
  }

  private async uploadMultipart(endpoint: string, formData: FormData): Promise<ApiResponse<any>> {
    const remainingCooldown = this.rateLimitUntil - Date.now();
    if (remainingCooldown > 0) {
      return {
        success: false,
        error: 'Too many requests, please try again later.',
        rateLimited: true,
        retryAfterMs: remainingCooldown,
      };
    }

    const attempt = async (): Promise<{ status: number; data: ApiResponse<any> }> => {
      const token = this.getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      });

      let data: ApiResponse<any>;
      try {
        data = await response.json();
      } catch {
        data = { success: false, error: 'Unexpected server response' };
      }
      return { status: response.status, data };
    };

    let { status, data } = await attempt();

    if (status === 429) {
      this.rateLimitUntil = Date.now() + ApiClient.RATE_LIMIT_COOLDOWN_MS;
      return {
        ...data,
        success: false,
        rateLimited: true,
        retryAfterMs: ApiClient.RATE_LIMIT_COOLDOWN_MS,
        error: data.error || 'Too many requests, please try again later.',
      };
    }

    if (status === 401 && this.getRefreshToken()) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        ({ status, data } = await attempt());
      } else {
        this.clearTokens();
        if (typeof window !== 'undefined') window.location.href = '/login';
      }
    }

    return data;
  }

  async updateBook(id: string, data: Record<string, unknown>): Promise<ApiResponse<any>> {
    return this.put(`/books/${id}`, data);
  }

  async deleteBook(id: string): Promise<ApiResponse<any>> {
    return this.delete(`/books/${id}`);
  }

  // Transactions
  async getTransactions(params?: Record<string, string>): Promise<ApiResponse<any[]>> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/transactions${query}`);
  }

async createBorrowRequest(data: {
    bookIds: string[];
    notes?: string;
  }): Promise<ApiResponse<any>> {
    return this.post('/transactions/requests', { bookIds: data.bookIds, notes: data.notes });
  }

  async getBorrowRequests(params?: Record<string, string>): Promise<ApiResponse<any[]>> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/transactions/requests${query}`);
  }

  async getBorrowRequest(id: string): Promise<ApiResponse<any>> {
    return this.get(`/transactions/requests/${id}`);
  }

  async approveRequest(id: string): Promise<ApiResponse<any>> {
    return this.put(`/transactions/requests/${id}/approve`);
  }

  // Generate a unique QR code for a pending borrow request (librarian).
  async generateRequestQR(id: string): Promise<ApiResponse<any>> {
    return this.get(`/transactions/requests/${id}/qr`);
  }

  // Confirm approval after the borrower scans the QR on their phone or enters code manually.
  async approveByQRCode(requestId: string, token: string, approvalCode?: string): Promise<ApiResponse<any>> {
    return this.post('/transactions/requests/approve-qr', { requestId, token, approvalCode });
  }

  async rejectRequest(id: string, reason: string): Promise<ApiResponse<any>> {
    return this.put(`/transactions/requests/${id}/reject`, { reason });
  }

async returnBook(id: string, qrCode?: string): Promise<ApiResponse<any>> {
    return this.put(`/transactions/${id}/return`, { qrCode });
  }

  async declareMissing(id: string, reason?: string): Promise<ApiResponse<any>> {
    return this.put(`/transactions/${id}/missing`, { reason });
  }

async payFine(id: string, amount: number): Promise<ApiResponse<any>> {
    return this.put(`/transactions/${id}/pay-fine`, { amount });
  }

  // Notifications
  async getNotifications(params?: Record<string, string>): Promise<ApiResponse<any>> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/notifications${query}`);
  }

  async getUnreadCount(): Promise<ApiResponse<{ unreadCount: number }>> {
    return this.get('/notifications/unread-count');
  }

  async markNotificationRead(id: string): Promise<ApiResponse<any>> {
    return this.put(`/notifications/${id}/read`);
  }

  async markAllNotificationsRead(): Promise<ApiResponse<any>> {
    return this.put('/notifications/mark-all-read');
  }

// Analytics
  async getDashboardStats(): Promise<ApiResponse<any>> {
    return this.get('/analytics/dashboard');
  }

  async getMyDashboardStats(): Promise<ApiResponse<any>> {
    return this.get('/analytics/my-dashboard');
  }

  async getMonthlyTrends(months?: number): Promise<ApiResponse<any>> {
    return this.get(`/analytics/monthly-trends?months=${months || 6}`);
  }

  async getDepartmentDistribution(): Promise<ApiResponse<any>> {
    return this.get('/analytics/department-distribution');
  }

  // Policies
  async getPolicies(): Promise<ApiResponse<any[]>> {
    return this.get('/policies');
  }

  async updatePolicy(key: string, value: string, description?: string): Promise<ApiResponse<any>> {
    return this.put('/policies', { key, value, description });
  }

  // Activity Logs
  async getActivities(params?: Record<string, string>): Promise<ApiResponse<any[]>> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/activities${query}`);
  }

  // Categories
  async getCategories(): Promise<ApiResponse<any[]>> {
    return this.get('/categories');
  }

  // EBooks
  async getEBooks(params?: Record<string, string>): Promise<ApiResponse<any[]>> {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return this.get(`/ebooks${query}`);
  }

  async getEBook(id: string): Promise<ApiResponse<any>> {
    return this.get(`/ebooks/${id}`);
  }

  async createEBook(data: {
    isbn: string;
    title: string;
    author: string;
    publisher?: string;
    publishYear?: number;
    edition?: string;
    categoryId?: string;
    description?: string;
    coverImage?: string;
    language?: string;
    fileUrl: string;
    fileSize?: number;
    format?: 'PDF' | 'EPUB' | 'MOBI';
  }): Promise<ApiResponse<any>> {
    return this.post('/ebooks', data);
  }

  async updateEBook(id: string, data: Record<string, unknown>): Promise<ApiResponse<any>> {
    return this.put(`/ebooks/${id}`, data);
  }

  async deleteEBook(id: string): Promise<ApiResponse<any>> {
    return this.delete(`/ebooks/${id}`);
  }

  // Reports
  getReportUrl(type: string, format: 'pdf' | 'xlsx' = 'pdf'): string {
    const token = this.getToken();
    return `${this.baseUrl}/reports/${type}?format=${format}&token=${token}`;
  }
}

export const api = new ApiClient(API_BASE_URL);

export default api;

