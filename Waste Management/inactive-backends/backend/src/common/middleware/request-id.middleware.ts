import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { RequestWithContext } from '../types/request-with-context';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithContext, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-id');
    const requestId = incoming && incoming.trim().length > 0 ? incoming : `req_${randomUUID()}`;

    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
