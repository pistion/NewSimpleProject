import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { VultrService } from './vultr.service';

@ApiTags('vultr')
@Controller({ path: 'vultr', version: '1' })
export class VultrController {
  constructor(private readonly vultr: VultrService) {}

  @Get('settings')
  @ApiOkResponse({ description: 'Returns Vultr configuration status (never exposes the key).' })
  getSettings() {
    return { configured: this.vultr.isConfigured() };
  }

  @Get('regions')
  @ApiOkResponse({ description: 'Lists available Vultr regions.' })
  listRegions() {
    return this.vultr.listRegions();
  }

  @Get('plans')
  @ApiOkResponse({ description: 'Lists available Vultr plans.' })
  listPlans(@Query('type') type?: string) {
    return this.vultr.listPlans(type);
  }

  @Get('os')
  @ApiOkResponse({ description: 'Lists available Vultr operating systems.' })
  listOs() {
    return this.vultr.listOperatingSystems();
  }
}
