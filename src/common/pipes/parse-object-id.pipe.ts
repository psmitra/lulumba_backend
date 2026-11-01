import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isValidObjectId } from '../utils/object-id.util.js';

/** Rejects malformed ids with 400 before they reach a service. */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (!isValidObjectId(value)) {
      throw new BadRequestException('Invalid id format');
    }
    return value;
  }
}
