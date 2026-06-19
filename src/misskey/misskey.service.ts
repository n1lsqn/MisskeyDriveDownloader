import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '../config/config.service';

export interface MisskeyFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface MisskeyFile {
  id: string;
  name: string;
  url: string;
  folderId: string | null;
  size: number;
}

@Injectable()
export class MisskeyService {
  private readonly logger = new Logger(MisskeyService.name);

  constructor(private readonly configService: ConfigService) {}

  private get instanceUrl(): string {
    return this.configService.misskeyInstanceUrl;
  }

  private get apiToken(): string {
    return this.configService.misskeyApiToken;
  }

  private sanitizeName(name: string): string {
    // Replace invalid filesystem characters: / \ ? % * : | " < > and control chars
    // eslint-disable-next-line no-control-regex, no-useless-escape
    return name.replace(/[\/\\?%*:|"<>\x00-\x1F]/g, '_');
  }

  private async postRequest<T>(
    endpoint: string,
    data: Record<string, unknown> = {},
  ): Promise<T> {
    const url = `${this.instanceUrl}${endpoint}`;
    const payload = {
      i: this.apiToken,
      ...data,
    };

    try {
      const response = await axios.post<T>(url, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        this.logger.error(
          `Misskey API error on POST ${endpoint}: ${err.response?.status} - ${JSON.stringify(err.response?.data)}`,
        );
      } else {
        this.logger.error(
          `Misskey API error on POST ${endpoint}:`,
          String(err),
        );
      }
      throw err;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Endpoint /api/i returns user information
      await this.postRequest('/api/i');
      return true;
    } catch {
      this.logger.warn(
        `Failed to connect to Misskey instance: ${this.instanceUrl}`,
      );
      return false;
    }
  }

  async getFolders(): Promise<MisskeyFolder[]> {
    this.logger.log('Fetching all folders from Misskey Drive...');
    const folders: MisskeyFolder[] = [];
    let untilId: string | undefined;

    while (true) {
      const limit = 100;
      const data: Record<string, unknown> = { limit };
      if (untilId) {
        data.untilId = untilId;
      }

      const pageFolders = await this.postRequest<MisskeyFolder[]>(
        '/api/drive/folders',
        data,
      );
      if (!pageFolders || pageFolders.length === 0) {
        break;
      }

      folders.push(...pageFolders);
      untilId = pageFolders[pageFolders.length - 1].id;

      if (pageFolders.length < limit) {
        break;
      }
    }

    this.logger.log(`Fetched ${folders.length} folders.`);
    return folders;
  }

  async getFiles(): Promise<MisskeyFile[]> {
    this.logger.log('Fetching all files from Misskey Drive...');
    const files: MisskeyFile[] = [];
    let untilId: string | undefined;

    while (true) {
      const limit = 100;
      const data: Record<string, unknown> = { limit };
      if (untilId) {
        data.untilId = untilId;
      }

      const pageFiles = await this.postRequest<MisskeyFile[]>(
        '/api/drive/files',
        data,
      );
      if (!pageFiles || pageFiles.length === 0) {
        break;
      }

      files.push(...pageFiles);
      untilId = pageFiles[pageFiles.length - 1].id;

      if (pageFiles.length < limit) {
        break;
      }
    }

    this.logger.log(`Fetched ${files.length} files.`);
    return files;
  }

  async buildFolderPathMap(): Promise<Map<string, string>> {
    const folders = await this.getFolders();
    const folderMap = new Map<string, MisskeyFolder>();
    for (const f of folders) {
      folderMap.set(f.id, f);
    }

    const pathMap = new Map<string, string>();

    const resolvePath = (
      folderId: string,
      visited = new Set<string>(),
    ): string => {
      if (pathMap.has(folderId)) {
        return pathMap.get(folderId)!;
      }
      if (visited.has(folderId)) {
        // Cyclic directory reference detected, break the loop
        return 'loop_dir';
      }
      visited.add(folderId);

      const folder = folderMap.get(folderId);
      if (!folder) {
        return '';
      }

      const sanitizedFolderName = this.sanitizeName(folder.name);
      if (folder.parentId) {
        const parentPath = resolvePath(folder.parentId, visited);
        const fullPath = parentPath
          ? `${parentPath}/${sanitizedFolderName}`
          : sanitizedFolderName;
        pathMap.set(folderId, fullPath);
        return fullPath;
      } else {
        pathMap.set(folderId, sanitizedFolderName);
        return sanitizedFolderName;
      }
    };

    for (const f of folders) {
      resolvePath(f.id);
    }

    return pathMap;
  }

  getSanitizedFileName(name: string): string {
    return this.sanitizeName(name);
  }
}
