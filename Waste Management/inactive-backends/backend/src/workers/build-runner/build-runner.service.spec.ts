import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BuildRunnerService } from './build-runner.service';

describe('BuildRunnerService', () => {
  it('runs a local build directory and creates a zip artifact', async () => {
    const sourceDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'glondia-build-test-'));
    await fs.promises.mkdir(path.join(sourceDirectory, 'public'));
    await fs.promises.writeFile(path.join(sourceDirectory, 'public', 'index.html'), '<h1>Glondia</h1>');

    const service = new BuildRunnerService();
    const result = await service.run({
      organizationId: 'org_1',
      projectId: 'project_1',
      deploymentId: 'deployment_1',
      installCommand: 'node --version',
      buildCommand: null,
      outputDirectory: 'public',
      rootDirectory: null,
      sourceDirectory
    });

    expect(result).toMatchObject({
      outputDirectory: 'public',
      checksum: expect.any(String),
      artifactPath: expect.stringContaining('glondia-deploy-deployment_1.zip')
    });
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(fs.existsSync(result.artifactPath)).toBe(true);

    await fs.promises.rm(sourceDirectory, { recursive: true, force: true });
    await fs.promises.rm(result.artifactPath, { force: true });
  });
});
