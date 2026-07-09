import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  updateProfile(userId: string, data: { name?: string; avatarUrl?: string }) {
    const update: { name?: string; avatarUrl?: string } = {};
    if (data.name !== undefined) update.name = data.name.trim();
    if (data.avatarUrl !== undefined) update.avatarUrl = data.avatarUrl.trim() || null as any;

    return this.prisma.user.update({
      where: { id: userId },
      data: update,
      select: { id: true, name: true, email: true, avatarUrl: true, status: true, updatedAt: true }
    });
  }
}
