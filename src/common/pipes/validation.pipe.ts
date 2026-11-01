import { ValidationPipe } from '@nestjs/common';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    // Field values may be personal data; keep them out of error messages.
    validationError: { target: false, value: false },
  });
}
