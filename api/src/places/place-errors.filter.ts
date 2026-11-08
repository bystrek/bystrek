import {
  ArgumentsHost,
  Catch,
  ConflictException,
  type ExceptionFilter,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { GeocoderError } from '../geo/geocoder';
import { DuplicatePlaceError, LocationNotFoundError, PlaceNotFoundError } from './places.errors';

type PlaceError = PlaceNotFoundError | DuplicatePlaceError | LocationNotFoundError | GeocoderError;

function toHttp(error: PlaceError): HttpException {
  if (error instanceof PlaceNotFoundError) return new NotFoundException(error.message);
  if (error instanceof DuplicatePlaceError) return new ConflictException(error.message);
  if (error instanceof LocationNotFoundError) {
    return new UnprocessableEntityException(error.message);
  }
  // No unlocated places: a geocoder outage blocks the save.
  return new ServiceUnavailableException("Couldn't reach the geocoder. Try again later.");
}

// Maps places errors to HTTP responses for the places controllers.
@Catch(PlaceNotFoundError, DuplicatePlaceError, LocationNotFoundError, GeocoderError)
export class PlaceErrorsFilter implements ExceptionFilter<PlaceError> {
  catch(error: PlaceError, host: ArgumentsHost) {
    const http = toHttp(error);
    host.switchToHttp().getResponse<Response>().status(http.getStatus()).json(http.getResponse());
  }
}
