import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);
  private vpsMarkup: number;
  private domainMarkup: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {
    // Defaults from env until DB rules are loaded
    const envMarkup = this.config.get<number>('PLATFORM_MARKUP_PERCENT', 30);
    this.vpsMarkup = envMarkup;
    this.domainMarkup = envMarkup;
  }

  async onModuleInit() {
    await this.reload();
  }

  /** Reload pricing rules from DB — call after seeding or admin updates. */
  async reload(): Promise<void> {
    try {
      const rules = await this.prisma.pricingRule.findMany({
        where: { isActive: true }
      });

      for (const rule of rules) {
        const value = Number(rule.value);
        if (rule.scope === 'vps_markup' && rule.key === 'default') {
          this.vpsMarkup = value;
        } else if (rule.scope === 'domain_markup' && rule.key === 'default') {
          this.domainMarkup = value;
        }
      }

      this.logger.debug(`Pricing loaded: vps=${this.vpsMarkup}% domain=${this.domainMarkup}%`);
    } catch (err) {
      // DB might not exist yet during migration — fall back to env
      this.logger.warn(`Could not load pricing rules from DB: ${(err as Error).message}`);
    }
  }

  getVpsMarkup(): number {
    return this.vpsMarkup;
  }

  getDomainMarkup(): number {
    return this.domainMarkup;
  }

  /** Calculate markup amounts for a given base cost and scope. */
  calculateMarkup(baseCents: number, scope: 'vps' | 'domain'): {
    markupPercent: number;
    markupAmountCents: number;
    totalCents: number;
  } {
    const markupPercent = scope === 'vps' ? this.vpsMarkup : this.domainMarkup;
    const markupAmountCents = Math.round(baseCents * (markupPercent / 100));
    return { markupPercent, markupAmountCents, totalCents: baseCents + markupAmountCents };
  }
}
