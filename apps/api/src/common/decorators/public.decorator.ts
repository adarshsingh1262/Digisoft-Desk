import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'digisoft:isPublic';

/** Opts a route out of authentication and permission checks. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
