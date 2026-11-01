import { ProfilesModule } from '@modules/profiles/profiles.module.js';
import { Module } from '@nestjs/common';
import { AuthController } from './controller/auth.controller.js';
import { GhanaWorksClient } from './ghanaworks/ghanaworks.client.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AuthService } from './service/auth.service.js';

@Module({
  imports: [ProfilesModule],
  controllers: [AuthController],
  providers: [AuthService, GhanaWorksClient, CsrfGuard, JwtAuthGuard],
  // JwtAuthGuard is registered globally in AppModule, after the throttler.
  exports: [JwtAuthGuard],
})
export class AuthModule {}
