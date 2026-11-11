import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { EventNotFoundError, InvalidSpanError, UnknownCategoryError } from './log.errors';

type LogError = EventNotFoundError | UnknownCategoryError | InvalidSpanError;

function toHttp(error: LogError): HttpException {
  if (error instanceof EventNotFoundError) return new NotFoundException(error.message);
  if (error instanceof InvalidSpanError) return new BadRequestException(error.message);
  return new UnprocessableEntityException(error.message);
}

// Maps log errors to HTTP responses for the log controllers.
@Catch(EventNotFoundError, UnknownCategoryError, InvalidSpanError)
export class LogErrorsFilter implements ExceptionFilter<LogError> {
  catch(error: LogError, host: ArgumentsHost) {
    const http = toHttp(error);
    host.switchToHttp().getResponse<Response>().status(http.getStatus()).json(http.getResponse());
  }
}
