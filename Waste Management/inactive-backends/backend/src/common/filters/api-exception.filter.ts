import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { RequestWithContext } from '../types/request-with-context';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;
    const message = this.resolveMessage(payload, exception);
    const code = status === HttpStatus.INTERNAL_SERVER_ERROR ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED';

    response.status(status).json({
      error: {
        code,
        message,
        details: typeof payload === 'object' && payload !== null ? payload : {}
      },
      meta: {
        requestId: request.requestId
      }
    });
  }

  private resolveMessage(payload: unknown, exception: unknown) {
    if (typeof payload === 'string') {
      return payload;
    }

    if (typeof payload === 'object' && payload !== null && 'message' in payload) {
      const message = (payload as { message: unknown }).message;
      return Array.isArray(message) ? message.join(', ') : String(message);
    }

    return exception instanceof Error ? exception.message : 'Unexpected error';
  }
}
