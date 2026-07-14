import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from '../decorators/roles.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

/** Role hierarchy — higher roles satisfy lower requirements. */
const ROLE_RANK: Record<Role, number> = {
  customer: 0,
  moderator: 1,
  admin: 2,
  super_admin: 3,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    if (!user) throw new ForbiddenException('Insufficient permissions');

    const userRank = ROLE_RANK[user.role as Role] ?? -1;
    const minRequired = Math.min(...required.map((r) => ROLE_RANK[r]));
    if (userRank < minRequired) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
