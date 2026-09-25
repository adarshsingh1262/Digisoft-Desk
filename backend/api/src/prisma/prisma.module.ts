import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { applyTenantScope, type TenantPrismaClient } from '@digisoft/db';

export const TENANT_PRISMA = Symbol('TENANT_PRISMA');

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: TENANT_PRISMA,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): TenantPrismaClient => applyTenantScope(prisma),
    },
  ],
  exports: [PrismaService, TENANT_PRISMA],
})
export class PrismaModule {}
