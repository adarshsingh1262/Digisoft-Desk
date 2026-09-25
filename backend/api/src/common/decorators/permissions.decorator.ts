import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@digisoft/shared';

export const PERMISSIONS_KEY = 'digisoft:permissions';

/** Route requires every listed permission. */
export const RequirePermissions = (
  ...permissions: PermissionKey[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);
