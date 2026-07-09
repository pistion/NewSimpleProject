import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  searchUsers(query: string, take = 20) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query } },
          { name: { contains: query } }
        ]
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          select: {
            organization: { select: { id: true, name: true } },
            role: { select: { key: true, name: true } },
            status: true
          }
        }
      },
      take,
      orderBy: { createdAt: 'desc' }
    });
  }

  listOrganizations(take = 50, skip = 0) {
    return this.prisma.organization.findMany({
      take,
      skip,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            members: true,
            projects: true,
            domains: true
          }
        }
      }
    });
  }

  findOrganizationById(id: string) {
    return this.prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          where: { status: 'active' },
          include: {
            user: { select: { id: true, email: true, name: true } },
            role: { select: { key: true, name: true } }
          }
        },
        _count: { select: { projects: true, domains: true } }
      }
    });
  }

  getTotals() {
    return Promise.all([
      this.prisma.user.count(),
      this.prisma.organization.count(),
      this.prisma.project.count({ where: { deletedAt: null } }),
      this.prisma.deployment.count(),
      this.prisma.domain.count({ where: { deletedAt: null } })
    ]).then(([users, organizations, projects, deployments, domains]) => ({
      users,
      organizations,
      projects,
      deployments,
      domains
    }));
  }
}
