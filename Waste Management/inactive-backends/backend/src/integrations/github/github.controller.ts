import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  RawBody,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequestWithContext } from '../../common/types/request-with-context';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import { GitHubService } from './github.service';
import { GitHubPushEvent } from './github.types';

@ApiTags('github')
@Controller({ path: 'github', version: '1' })
export class GitHubController {
  constructor(
    private readonly github: GitHubService,
    private readonly config: ConfigService,
  ) {}

  // ─── OAuth flow ───────────────────────────────────────────────────────────

  /**
   * Redirect the browser to GitHub's OAuth authorization page.
   * Called directly by the frontend (not via fetch) so it can follow the redirect.
   */
  @Get('auth')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions('project:read')
  @Redirect()
  initiateOAuth(
    @Req() req: RequestWithContext,
    @Query('return') returnPath?: string,
  ) {
    const url = this.github.getAuthorizationUrl(
      req.auth!.user.id,
      req.auth!.organization.id,
      returnPath,
    );
    return { url, statusCode: 302 };
  }

  /**
   * GitHub calls this after the user authorizes the app.
   * Exchanges the code for a token, stores it, then redirects back to the frontend.
   */
  @Get('callback')
  @Redirect()
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');

    if (!code || !state) {
      return { url: `${frontendUrl}?github_error=missing_params`, statusCode: 302 };
    }

    try {
      const result = await this.github.handleCallback(code, state);
      const returnPath = result.returnPath ?? '';
      return {
        url: `${frontendUrl}${returnPath}?github_connected=1&login=${encodeURIComponent(result.githubLogin)}`,
        statusCode: 302,
      };
    } catch (err) {
      const msg = (err as Error).message;
      return { url: `${frontendUrl}?github_error=${encodeURIComponent(msg)}`, statusCode: 302 };
    }
  }

  // ─── Status & account ─────────────────────────────────────────────────────

  @Get('status')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions('project:read')
  @ApiOkResponse({ description: 'Returns GitHub connection status for the current user.' })
  getStatus(@Req() req: RequestWithContext) {
    return this.github.getStatus(req.auth!.user.id);
  }

  @Delete('disconnect')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions('project:update')
  @ApiOkResponse({ description: 'Removes the stored GitHub OAuth token.' })
  disconnect(@Req() req: RequestWithContext) {
    return this.github.disconnect(req.auth!.user.id);
  }

  // ─── Repository listing ───────────────────────────────────────────────────

  @Get('repos')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions('project:read')
  @ApiOkResponse({ description: 'Lists repositories accessible to the connected GitHub account.' })
  listRepos(@Req() req: RequestWithContext) {
    return this.github.listRepos(req.auth!.user.id);
  }

  @Get('repos/:owner/:repo/branches')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions('project:read')
  @ApiOkResponse({ description: 'Lists branches for a specific repository.' })
  listBranches(
    @Req() req: RequestWithContext,
    @Param('owner') owner: string,
    @Param('repo') repo: string,
  ) {
    return this.github.listBranches(req.auth!.user.id, owner, repo);
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  /**
   * Receives push events from GitHub webhooks.
   * No JWT auth — validated by HMAC signature instead.
   * Configure in GitHub: Settings → Webhooks → Add webhook
   *   Payload URL: https://glondia-backend.onrender.com/api/v1/github/webhooks
   *   Content-Type: application/json
   *   Secret: value of GITHUB_WEBHOOK_SECRET env var
   *   Events: Pushes
   */
  @Post('webhooks')
  @ApiOkResponse({ description: 'Receives GitHub push webhook and triggers deployments.' })
  async handleWebhook(
    @RawBody() rawBody: Buffer,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
  ) {
    if (!this.github.validateWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature.');
    }

    if (event !== 'push') {
      return { received: true, event, processed: false };
    }

    let payload: GitHubPushEvent;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON payload.');
    }

    // Ignore branch deletions (head_commit is null)
    if (!payload.head_commit) {
      return { received: true, event, processed: false, reason: 'branch_deletion' };
    }

    const result = await this.github.processPushEvent(payload);
    return { received: true, event, processed: true, ...result };
  }
}
