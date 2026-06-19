import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

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

  private sanitizeName(name: string): string {
    // Replace invalid filesystem characters: / \ ? % * : | " < > and control chars
    // eslint-disable-next-line no-control-regex, no-useless-escape
    return name.replace(/[\/\\?%*:|"<>\x00-\x1F]/g, '_');
  }

  private async postRequest<T>(
    instanceUrl: string,
    token: string,
    endpoint: string,
    data: Record<string, unknown> = {},
  ): Promise<T> {
    const formattedUrl = instanceUrl.replace(/\/$/, '');
    const url = `${formattedUrl}${endpoint}`;
    const payload = {
      i: token,
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

  async testConnection(instanceUrl: string, token: string): Promise<boolean> {
    try {
      // Endpoint /api/i returns user information
      await this.postRequest<{ username: string }>(
        instanceUrl,
        token,
        '/api/i',
      );
      return true;
    } catch {
      this.logger.warn(`Failed to connect to Misskey instance: ${instanceUrl}`);
      return false;
    }
  }

  async getUserInfo(
    instanceUrl: string,
    token: string,
  ): Promise<{ username: string; name: string | null } | null> {
    try {
      const data = await this.postRequest<{
        username: string;
        name: string | null;
      }>(instanceUrl, token, '/api/i');
      return data;
    } catch {
      return null;
    }
  }

  async getFolders(
    instanceUrl: string,
    token: string,
  ): Promise<MisskeyFolder[]> {
    this.logger.log(
      `Fetching all folders from Misskey Drive on ${instanceUrl}...`,
    );
    const folders: MisskeyFolder[] = [];
    let untilId: string | undefined;

    while (true) {
      const limit = 100;
      const data: Record<string, unknown> = { limit };
      if (untilId) {
        data.untilId = untilId;
      }

      const pageFolders = await this.postRequest<MisskeyFolder[]>(
        instanceUrl,
        token,
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

  async getFiles(instanceUrl: string, token: string): Promise<MisskeyFile[]> {
    this.logger.log(
      `Fetching all files from Misskey Drive on ${instanceUrl}...`,
    );
    const files: MisskeyFile[] = [];
    let untilId: string | undefined;

    while (true) {
      const limit = 100;
      const data: Record<string, unknown> = { limit };
      if (untilId) {
        data.untilId = untilId;
      }

      const pageFiles = await this.postRequest<MisskeyFile[]>(
        instanceUrl,
        token,
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

  async buildFolderPathMap(
    instanceUrl: string,
    token: string,
  ): Promise<Map<string, string>> {
    const folders = await this.getFolders(instanceUrl, token);
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
