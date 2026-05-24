import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CryptoService } from '../../common/crypto/crypto.service';
import { PrismaService } from '../../database/prisma.service';
import { DeploymentQueueService } from '../../workers/queues/deployment-queue.service';
import {
  GitHubBranch,
  GitHubPushEvent,
  GitHubRepo,
  GitHubTokenResponse,
  GitHubUser,
} from './github.types';

interface OAuthState {
  userId: string;
  organizationId: string;
  returnPath?: string;
}

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private readonly GITHUB_API = 'https://api.github.com';
  private readonly PROVIDER = 'github';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly jwt: JwtService,
    private readonly queue: DeploymentQueueService,
  ) {}

  // ─── OAuth helpers ────────────────────────────────────────────────────────

  /** Build the GitHub OAuth authorization URL. */
  getAuthorizationUrl(userId: string, organizationId: string, returnPath?: string): string {
    const clientId = this.config.getOrThrow<string>('GITHUB_CLIENT_ID');
    const redirectUri = this.config.getOrThrow<string>('GITHUB_REDIRECT_URI');

    // Short-lived state token to prevent CSRF
    const state = this.jwt.sign(
      { userId, organizationId, returnPath } satisfies OAuthState,
      { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: '10m' }
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo,read:user,user:email',
      state,
      allow_signup: 'true',
    });

    return `https://github.com/login/oauth/authorize?${params}`;
  }

  /** Exchange the OAuth code for a token and persist it in oauth_accounts. */
  async handleCallback(code: string, rawState: string) {
    // Verify and decode state JWT
    let state: OAuthState;
    try {
      state = this.jwt.verify<OAuthState>(rawState, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired OAuth state.');
    }

    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.getOrThrow<string>('GITHUB_CLIENT_ID'),
        client_secret: this.config.getOrThrow<string>('GITHUB_CLIENT_SECRET'),
        code,
        redirect_uri: this.config.getOrThrow<string>('GITHUB_REDIRECT_URI'),
      }),
    });

    const tokenData: GitHubTokenResponse = await tokenRes.json();
    if (tokenData.error || !tokenData.access_token) {
      throw new UnauthorizedException(`GitHub OAuth failed: ${tokenData.error_description ?? tokenData.error}`);
    }

    // Fetch GitHub user info
    const ghUser = await this.apiGet<GitHubUser>('/user', tokenData.access_token);

    // Upsert oauth_accounts row
    await this.prisma.oauthAccount.upsert({
      where: { provider_providerUserId: { provider: this.PROVIDER, providerUserId: String(ghUser.id) } },
      update: {
        accessTokenEncrypted: this.crypto.encrypt(tokenData.access_token),
        updatedAt: new Date(),
      },
      create: {
        userId: state.userId,
        provider: this.PROVIDER,
        providerUserId: String(ghUser.id),
        accessTokenEncrypted: this.crypto.encrypt(tokenData.access_token),
      },
    });

    this.logger.log(`GitHub connected for user ${state.userId} (gh: ${ghUser.login})`);

    return {
      userId: state.userId,
      organizationId: state.organizationId,
      githubLogin: ghUser.login,
      returnPath: state.returnPath,
    };
  }

  // ─── Status & disconnect ──────────────────────────────────────────────────

  async getStatus(userId: string) {
    const account = await this.prisma.oauthAccount.findFirst({
      where: { userId, provider: this.PROVIDER },
      select: { providerUserId: true, updatedAt: true },
    });

    if (!account) return { connected: false };

    return {
      connected: true,
      githubUserId: account.providerUserId,
      connectedAt: account.updatedAt,
    };
  }

  async disconnect(userId: string) {
    await this.prisma.oauthAccount.deleteMany({
      where: { userId, provider: this.PROVIDER },
    });
    return { disconnected: true };
  }

  // ─── Repository listing ───────────────────────────────────────────────────

  async listRepos(userId: string): Promise<GitHubRepo[]> {
    const token = await this.getTokenForUser(userId);
    const repos: GitHubRepo[] = [];
    let page = 1;

    while (page <= 10) {                // safety cap — max 1 000 repos
      const batch = await this.apiGet<GitHubRepo[]>(
        `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`,
        token,
      );
      repos.push(...batch);
      if (batch.length < 100) break;
      page++;
    }

    return repos.map(r => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      private: r.private,
      description: r.description,
      html_url: r.html_url,
      clone_url: r.clone_url,
      default_branch: r.default_branch,
      language: r.language,
      updated_at: r.updated_at,
      pushed_at: r.pushed_at,
      stargazers_count: r.stargazers_count,
      owner: r.owner,
    }));
  }

  async listBranches(userId: string, owner: string, repo: string): Promise<GitHubBranch[]> {
    const token = await this.getTokenForUser(userId);
    return this.apiGet<GitHubBranch[]>(`/repos/${owner}/${repo}/branches?per_page=100`, token);
  }

  // ─── Webhook processing ───────────────────────────────────────────────────

  /**
   * Validate the X-Hub-Signature-256 header against the raw request body.
   * Returns true if valid, false otherwise.
   */
  validateWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.get<string>('GITHUB_WEBHOOK_SECRET', '');
    if (!secret) return true; // Skip validation when no secret configured (dev mode)
    if (!signature?.startsWith('sha256=')) return false;

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const actual = signature.slice(7); // strip "sha256="

    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
    } catch {
      return false;
    }
  }

  /**
   * Process a GitHub push event — find matching projects and queue deployments.
   */
  async processPushEvent(payload: GitHubPushEvent, organizationId?: string) {
    const branch = payload.ref.replace('refs/heads/', '');
    const owner = payload.repository.owner.login;
    const repoName = payload.repository.name;
    const commitSha = payload.head_commit?.id ?? '';
    const commitMessage = payload.head_commit?.message ?? 'GitHub push';

    this.logger.log(`GitHub push: ${owner}/${repoName}@${branch} (${commitSha.slice(0, 7)})`);

    // Find all projects that match this repo + branch
    const projects = await this.prisma.project.findMany({
      where: {
        repositoryProvider: 'github',
        repositoryOwner: owner,
        repositoryName: repoName,
        productionBranch: branch,
        status: 'active',
        ...(organizationId ? { organizationId } : {}),
      },
      select: { id: true, organizationId: true, name: true },
    });

    if (projects.length === 0) {
      this.logger.debug(`No matching projects for ${owner}/${repoName}@${branch}`);
      return { triggered: 0 };
    }

    // Create a deployment for each matching project and queue it
    const triggered: string[] = [];
    for (const project of projects) {
      try {
        const deployment = await this.prisma.deployment.create({
          data: {
            organizationId: project.organizationId,
            projectId: project.id,
            status: 'queued',
            source: 'git',
            environment: 'production',
            branch,
            commitSha,
            commitMessage: commitMessage.split('\n')[0].slice(0, 255),
            triggeredByUserId: null,
          },
        });

        await this.queue.enqueueBuild({
          version: 1,
          deploymentId: deployment.id,
          organizationId: project.organizationId,
          requestedByUserId: null,
        });

        triggered.push(deployment.id);
        this.logger.log(`Queued deployment ${deployment.id} for project ${project.name}`);
      } catch (err) {
        this.logger.error(`Failed to queue deployment for project ${project.id}: ${(err as Error).message}`);
      }
    }

    return { triggered: triggered.length, deploymentIds: triggered };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private async getTokenForUser(userId: string): Promise<string> {
    const account = await this.prisma.oauthAccount.findFirst({
      where: { userId, provider: this.PROVIDER },
      select: { accessTokenEncrypted: true },
    });

    if (!account?.accessTokenEncrypted) {
      throw new UnauthorizedException('GitHub account not connected. Connect GitHub first.');
    }

    return this.crypto.decrypt(account.accessTokenEncrypted);
  }

  private async apiGet<T>(path: string, token: string): Promise<T> {
    const response = await fetch(`${this.GITHUB_API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`GitHub API ${response.status}: ${path} — ${body}`);
    }

    return response.json() as Promise<T>;
  }
}
