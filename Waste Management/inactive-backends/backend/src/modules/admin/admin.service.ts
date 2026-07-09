import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminRepository } from './admin.repository';

@Injectable()
export class AdminService {
  constructor(private readonly repo: AdminRepository) {}

  getOverview() {
    return this.repo.getTotals();
  }

  searchUsers(query: string) {
    return this.repo.searchUsers(query.trim());
  }

  listOrganizations(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    return this.repo.listOrganizations(limit, skip);
  }

  async getOrganization(orgId: string) {
    const org = await this.repo.findOrganizationById(orgId);
    if (!org) throw new NotFoundException('Organization not found.');
    return org;
  }
}
