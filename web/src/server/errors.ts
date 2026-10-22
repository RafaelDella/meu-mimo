export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;

  constructor(code: string, status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
