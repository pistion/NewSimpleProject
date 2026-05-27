import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateVpsDto } from './dto/create-vps.dto';
import { VpsQuoteDto } from './dto/vps-quote.dto';
import { ResizeVpsDto } from './dto/resize-vps.dto';
import { ReinstallVpsDto } from './dto/reinstall-vps.dto';
import { CreateSnapshotDto } from './dto/create-snapshot.dto';
import { RestoreSnapshotDto } from './dto/restore-snapshot.dto';
import { SetBackupScheduleDto } from './dto/set-backup-schedule.dto';
import { VpsHostingService } from './vps-hosting.service';

function actor(req: RequestWithContext): { userId: string; organizationId: string } {
  return {
    userId:         req.auth!.user.id,
    organizationId: req.auth!.organization.id,
  };
}

@ApiTags('vps-hosting')
@Controller({ path: 'vps-hosting', version: '1' })
@UseGuards(JwtAuthGuard)
export class VpsHostingController {
  constructor(private readonly vpsHosting: VpsHostingService) {}

  @Public()
  @Get('settings')
  @ApiOkResponse({ description: 'Returns Vultr and PayPal configuration status.' })
  getSettings() {
    return this.vpsHosting.getSettings();
  }

  @Public()
  @Get('regions')
  @ApiOkResponse({ description: 'Lists Vultr regions.' })
  listRegions() {
    return this.vpsHosting.listRegions();
  }

  @Public()
  @Get('plans')
  @ApiOkResponse({ description: 'Lists Vultr plans.' })
  listPlans(@Query('type') type?: string) {
    return this.vpsHosting.listPlans(type);
  }

  @Public()
  @Get('os')
  @ApiOkResponse({ description: 'Lists Vultr operating systems.' })
  listOs() {
    return this.vpsHosting.listOs();
  }

  @Public()
  @Post('quote')
  @ApiOkResponse({ description: 'Returns pricing quote with markup for a VPS configuration.' })
  getQuote(@Body() dto: VpsQuoteDto) {
    return this.vpsHosting.getQuote(dto);
  }

  // ─── Services (deploy / list / manage) ──────────────────────────────────────

  @Post('services')
  @ApiCreatedResponse({ description: 'Deploys a new VPS immediately. Billed monthly based on usage.' })
  deployVps(@Body() dto: CreateVpsDto, @Req() req: RequestWithContext) {
    return this.vpsHosting.deployVps(dto, actor(req));
  }

  @Get('services')
  @ApiOkResponse({ description: 'Lists all VPS services for the authenticated organization.' })
  listServices(@Req() req: RequestWithContext) {
    return this.vpsHosting.listServices(actor(req));
  }

  @Get('services/:id')
  @ApiOkResponse({ description: 'Returns a single VPS service, refreshing status from Vultr.' })
  getService(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.getService(id, actor(req));
  }

  @Post('services/:id/start')
  @ApiOkResponse({ description: 'Starts (powers on) the VPS.' })
  startService(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.startService(id, actor(req));
  }

  @Post('services/:id/halt')
  @ApiOkResponse({ description: 'Halts (powers off) the VPS.' })
  haltService(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.haltService(id, actor(req));
  }

  @Post('services/:id/reboot')
  @ApiOkResponse({ description: 'Reboots the VPS.' })
  rebootService(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.rebootService(id, actor(req));
  }

  @Delete('services/:id')
  @ApiOkResponse({ description: 'Destroys (permanently deletes) the VPS.' })
  destroyService(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.destroyService(id, actor(req));
  }

  @Patch('services/:id/resize')
  @ApiOkResponse({ description: 'Resizes (upgrades/downgrades) the VPS to a new plan. Returns updated VPS record.' })
  resizeService(@Param('id') id: string, @Body() dto: ResizeVpsDto, @Req() req: RequestWithContext) {
    return this.vpsHosting.resizeService(id, dto, actor(req));
  }

  @Post('services/:id/reinstall')
  @ApiOkResponse({ description: 'Reinstalls the VPS operating system. All data on the instance will be wiped.' })
  reinstallService(@Param('id') id: string, @Body() dto: ReinstallVpsDto, @Req() req: RequestWithContext) {
    return this.vpsHosting.reinstallService(id, dto, actor(req));
  }

  // ─── SSH keys ─────────────────────────────────────────────────────────────────

  @Get('ssh-keys')
  @ApiOkResponse({ description: 'Lists all SSH keys registered on the Vultr account.' })
  listSshKeys() {
    return this.vpsHosting.listSshKeys();
  }

  @Delete('ssh-keys/:keyId')
  @ApiOkResponse({ description: 'Deletes an SSH key from the Vultr account.' })
  deleteSshKey(@Param('keyId') keyId: string, @Req() _req: RequestWithContext) {
    return this.vpsHosting.deleteSshKey(keyId);
  }

  // ─── Bandwidth ────────────────────────────────────────────────────────────────

  @Get('services/:id/bandwidth')
  @ApiOkResponse({ description: 'Returns bandwidth usage (incoming/outgoing bytes) for the VPS.' })
  getBandwidth(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.getBandwidth(id, actor(req));
  }

  // ─── Snapshots ────────────────────────────────────────────────────────────────

  @Get('snapshots')
  @ApiOkResponse({ description: 'Lists all snapshots on the Vultr account.' })
  listSnapshots() {
    return this.vpsHosting.listSnapshots();
  }

  @Post('services/:id/snapshots')
  @ApiCreatedResponse({ description: 'Creates a snapshot of the VPS.' })
  createSnapshot(@Param('id') id: string, @Body() dto: CreateSnapshotDto, @Req() req: RequestWithContext) {
    return this.vpsHosting.createSnapshot(id, dto, actor(req));
  }

  @Delete('snapshots/:snapshotId')
  @ApiOkResponse({ description: 'Deletes a snapshot permanently.' })
  deleteSnapshot(@Param('snapshotId') snapshotId: string) {
    return this.vpsHosting.deleteSnapshot(snapshotId);
  }

  @Post('services/:id/restore')
  @ApiOkResponse({ description: 'Restores the VPS from a snapshot. All current data will be replaced.' })
  restoreFromSnapshot(@Param('id') id: string, @Body() dto: RestoreSnapshotDto, @Req() req: RequestWithContext) {
    return this.vpsHosting.restoreFromSnapshot(id, dto, actor(req));
  }

  // ─── Backup schedule ──────────────────────────────────────────────────────────

  @Get('services/:id/backup-schedule')
  @ApiOkResponse({ description: 'Returns the current automatic backup schedule for the VPS.' })
  getBackupSchedule(@Param('id') id: string, @Req() req: RequestWithContext) {
    return this.vpsHosting.getBackupSchedule(id, actor(req));
  }

  @Post('services/:id/backup-schedule')
  @ApiOkResponse({ description: 'Sets the automatic backup schedule for the VPS.' })
  setBackupSchedule(@Param('id') id: string, @Body() dto: SetBackupScheduleDto, @Req() req: RequestWithContext) {
    return this.vpsHosting.setBackupSchedule(id, dto, actor(req));
  }
}
