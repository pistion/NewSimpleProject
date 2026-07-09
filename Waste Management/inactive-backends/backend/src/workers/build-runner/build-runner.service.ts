import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as archiver from 'archiver';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface BuildRunnerInput {
  organizationId: string;
  projectId: string;
  deploymentId: string;
  buildCommand: string | null;
  installCommand: string | null;
  outputDirectory: string | null;
  rootDirectory: string | null;
  /** Optional: path to already-cloned source dir (e.g. git checkout). If omitted, a temp dir is used. */
  sourceDirectory?: string;
}

export interface BuildRunnerResult {
  /** Absolute path to the zipped artifact on disk (caller must clean up). */
  artifactPath: string;
  outputDirectory: string;
  sizeBytes: number;
  checksum: string;
  logs: string[];
}

@Injectable()
export class BuildRunnerService {
  private readonly logger = new Logger(BuildRunnerService.name);

  async run(input: BuildRunnerInput): Promise<BuildRunnerResult> {
    const logs: string[] = [];
    const push = (line: string) => {
      this.logger.debug(line);
      logs.push(line);
    };

    const workdir = input.sourceDirectory ?? (await this.makeTempDir(input.deploymentId));
    const rootDir = input.rootDirectory ? path.join(workdir, input.rootDirectory) : workdir;
    const outputDirName = input.outputDirectory ?? 'dist';
    const outputDirAbs = path.join(rootDir, outputDirName);

    push(`[build-runner] workdir: ${workdir}`);
    push(`[build-runner] rootDir: ${rootDir}`);

    // Install
    const installCmd = input.installCommand ?? 'npm install --prefer-offline';
    push(`[build-runner] install: ${installCmd}`);
    await this.exec(installCmd, rootDir, push);

    // Build
    if (input.buildCommand) {
      push(`[build-runner] build: ${input.buildCommand}`);
      await this.exec(input.buildCommand, rootDir, push);
    } else {
      push(`[build-runner] no build command — skipping`);
    }

    // Verify output dir exists
    if (!fs.existsSync(outputDirAbs)) {
      throw new Error(
        `Build output directory "${outputDirName}" not found at ${outputDirAbs}. ` +
          `Check your project's outputDirectory setting.`
      );
    }

    // Zip the output
    push(`[build-runner] zipping ${outputDirAbs}`);
    const artifactPath = path.join(os.tmpdir(), `glondia-deploy-${input.deploymentId}.zip`);
    const sizeBytes = await this.zipDirectory(outputDirAbs, artifactPath);

    // Checksum
    const checksum = await this.md5File(artifactPath);
    push(`[build-runner] artifact: ${artifactPath} (${sizeBytes} bytes, md5=${checksum})`);

    return {
      artifactPath,
      outputDirectory: outputDirName,
      sizeBytes,
      checksum,
      logs
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private exec(command: string, cwd: string, push: (line: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, { cwd, shell: true, stdio: 'pipe' });

      child.stdout.on('data', (data: Buffer) =>
        data
          .toString()
          .split('\n')
          .filter(Boolean)
          .forEach((l) => push(`  ${l}`))
      );
      child.stderr.on('data', (data: Buffer) =>
        data
          .toString()
          .split('\n')
          .filter(Boolean)
          .forEach((l) => push(`  [stderr] ${l}`))
      );

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}: ${command}`));
        }
      });
      child.on('error', reject);
    });
  }

  private zipDirectory(sourceDir: string, destPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(destPath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      output.on('close', () => resolve(archive.pointer()));
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  private md5File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async makeTempDir(deploymentId: string): Promise<string> {
    const dir = path.join(os.tmpdir(), `glondia-build-${deploymentId}`);
    await fs.promises.mkdir(dir, { recursive: true });
    return dir;
  }
}
