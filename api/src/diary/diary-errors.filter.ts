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
import {
  DiaryEventNotFoundError,
  InvalidSpanError,
  UnknownDiaryCategoryError,
} from './diary.errors';

type DiaryError = DiaryEventNotFoundError | UnknownDiaryCategoryError | InvalidSpanError;

function toHttp(error: DiaryError): HttpException {
  if (error instanceof DiaryEventNotFoundError) return new NotFoundException(error.message);
  if (error instanceof InvalidSpanError) return new BadRequestException(error.message);
  return new UnprocessableEntityException(error.message);
}

// Maps diary errors to HTTP responses for the diary controllers.
@Catch(DiaryEventNotFoundError, UnknownDiaryCategoryError, InvalidSpanError)
export class DiaryErrorsFilter implements ExceptionFilter<DiaryError> {
  catch(error: DiaryError, host: ArgumentsHost) {
    const http = toHttp(error);
    host.switchToHttp().getResponse<Response>().status(http.getStatus()).json(http.getResponse());
  }
}
