import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createWriteStream, promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import { Readable } from 'stream';

export interface ArtifactObjectDescriptor {
  bucket: string;
  objectKey: string;
  publicUrl: string | null;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly artifactsBucket: string;
  private readonly assetsBucket: string;
  private readonly publicUrl: string;
  private readonly driver: 'local' | 's3';
  private readonly localRoot: string;

  constructor(private readonly config: ConfigService) {
    this.driver = this.config.get<'local' | 's3'>('STORAGE_DRIVER', 'local');
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID', 'glondia_minio');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY', 'glondia_minio_secret');
    const dataDir = this.config.get<string>('DATA_DIR', './data');

    this.artifactsBucket = this.config.get<string>('S3_ARTIFACTS_BUCKET', 'glondia-artifacts');
    this.assetsBucket = this.config.get<string>('S3_ASSETS_BUCKET', 'glondia-assets');
    this.publicUrl = this.config.get<string>('S3_PUBLIC_URL', 'http://localhost:9000');
    this.localRoot = resolve(dataDir, 'storage');

    this.client = new S3Client({
      endpoint,
      region: 'us-east-1', // MinIO ignores this; AWS uses the actual region
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true // required for MinIO
    });
  }

  async onModuleInit() {
    if (this.driver === 'local') {
      await fs.mkdir(this.bucketPath(this.artifactsBucket), { recursive: true });
      await fs.mkdir(this.bucketPath(this.assetsBucket), { recursive: true });
      return;
    }

    await this.ensureBucketExists(this.artifactsBucket);
    await this.ensureBucketExists(this.assetsBucket);
  }

  // ─── Artifacts ───────────────────────────────────────────────────────────────

  createDeploymentArtifactObject(input: {
    organizationId: string;
    projectId: string;
    deploymentId: string;
  }): ArtifactObjectDescriptor {
    const objectKey = [
      'organizations',
      input.organizationId,
      'projects',
      input.projectId,
      'deployments',
      input.deploymentId,
      'artifact.zip'
    ].join('/');

    return {
      bucket: this.artifactsBucket,
      objectKey,
      publicUrl: null
    };
  }

  async uploadArtifact(input: {
    organizationId: string;
    projectId: string;
    deploymentId: string;
    body: Buffer | Readable;
    contentType?: string;
    sizeBytes?: number;
  }): Promise<ArtifactObjectDescriptor> {
    const descriptor = this.createDeploymentArtifactObject(input);
    if (this.driver === 'local') {
      await this.writeLocalObject(descriptor.bucket, descriptor.objectKey, input.body);
      return descriptor;
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: descriptor.bucket,
        Key: descriptor.objectKey,
        Body: input.body,
        ContentType: input.contentType ?? 'application/zip',
        ContentLength: input.sizeBytes
      })
    );
    return descriptor;
  }

  async getArtifactSignedUrl(descriptor: ArtifactObjectDescriptor, expiresInSeconds = 3600): Promise<string> {
    if (this.driver === 'local') {
      return this.localObjectPath(descriptor.bucket, descriptor.objectKey);
    }

    const command = new GetObjectCommand({
      Bucket: descriptor.bucket,
      Key: descriptor.objectKey
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  // ─── Assets ──────────────────────────────────────────────────────────────────

  buildAssetKey(input: { organizationId: string; filename: string }): string {
    return `organizations/${input.organizationId}/assets/${input.filename}`;
  }

  async uploadAsset(input: {
    organizationId: string;
    filename: string;
    body: Buffer;
    contentType: string;
  }): Promise<{ objectKey: string; publicUrl: string }> {
    const objectKey = this.buildAssetKey(input);
    if (this.driver === 'local') {
      await this.writeLocalObject(this.assetsBucket, objectKey, input.body);
      return { objectKey, publicUrl: this.localObjectPath(this.assetsBucket, objectKey) };
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.assetsBucket,
        Key: objectKey,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: input.body.byteLength
      })
    );
    const publicUrl = `${this.publicUrl}/${this.assetsBucket}/${objectKey}`;
    return { objectKey, publicUrl };
  }

  async deleteAsset(objectKey: string): Promise<void> {
    if (this.driver === 'local') {
      await fs.rm(this.localObjectPath(this.assetsBucket, objectKey), { force: true });
      return;
    }

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.assetsBucket,
        Key: objectKey
      })
    );
  }

  async getAssetSignedUrl(objectKey: string, expiresInSeconds = 3600): Promise<string> {
    if (this.driver === 'local') {
      return this.localObjectPath(this.assetsBucket, objectKey);
    }

    const command = new GetObjectCommand({
      Bucket: this.assetsBucket,
      Key: objectKey
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  // ─── Generic put (for builder pages, etc.) ───────────────────────────────────

  async putObject(input: {
    bucket: 'artifacts' | 'assets';
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    const bucketName = input.bucket === 'artifacts' ? this.artifactsBucket : this.assetsBucket;
    if (this.driver === 'local') {
      await this.writeLocalObject(bucketName, input.key, input.body);
      return;
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType
      })
    );
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private async ensureBucketExists(bucketName: string): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucketName }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: bucketName }));
        this.logger.log(`Created S3 bucket: ${bucketName}`);
      } catch (createErr) {
        this.logger.warn(`Could not create S3 bucket "${bucketName}": ${(createErr as Error).message}`);
      }
    }
  }

  private bucketPath(bucketName: string): string {
    return join(this.localRoot, bucketName);
  }

  private localObjectPath(bucketName: string, objectKey: string): string {
    return join(this.bucketPath(bucketName), objectKey);
  }

  private async writeLocalObject(bucketName: string, objectKey: string, body: Buffer | Readable): Promise<void> {
    const targetPath = this.localObjectPath(bucketName, objectKey);
    await fs.mkdir(dirname(targetPath), { recursive: true });

    if (Buffer.isBuffer(body)) {
      await fs.writeFile(targetPath, body);
      return;
    }

    await new Promise<void>((resolvePromise, reject) => {
      const stream = createWriteStream(targetPath);
      body.pipe(stream);
      stream.on('finish', resolvePromise);
      stream.on('error', reject);
      body.on('error', reject);
    });
  }
}
