import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';

export interface JobRecord {
  id: string;
  status: 'queued' | 'processing' | 'uploading' | 'done' | 'expired' | 'failed';
  progress: number;
  totalFiles: number;
  currentFile: string | null;
  zipKey: string | null;
  createdAt: string;
  downloadedAt: string | null;
  expiresAt: string;
  error: string | null;
  instanceUrl: string | null;
  username: string | null;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db: sqlite3.Database | null = null;
  private readonly dbPath: string;

  constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'database.sqlite');
  }

  async onModuleInit() {
    await this.connect();
    await this.runMigration();
    await this.resetHangingJobs();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private runMigration(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not connected'));
        return;
      }

      const query = `
        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          progress INTEGER DEFAULT 0,
          totalFiles INTEGER DEFAULT 0,
          currentFile TEXT,
          zipKey TEXT,
          createdAt TEXT NOT NULL,
          downloadedAt TEXT,
          expiresAt TEXT NOT NULL,
          error TEXT,
          instanceUrl TEXT,
          username TEXT
        )
      `;

      this.db.run(query, (err) => {
        if (err) {
          return reject(err);
        }
        // Safely add columns to existing DB if they are missing
        if (!this.db) return resolve();
        this.db.run('ALTER TABLE jobs ADD COLUMN instanceUrl TEXT', () => {
          if (!this.db) return resolve();
          this.db.run('ALTER TABLE jobs ADD COLUMN username TEXT', () => {
            resolve();
          });
        });
      });
    });
  }

  private run(query: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not connected'));
      this.db.run(query, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private get<T>(query: string, params: unknown[] = []): Promise<T | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not connected'));
      this.db.get(query, params, (err, row) => {
        if (err) reject(err);
        else resolve((row as T) || null);
      });
    });
  }

  private all<T>(query: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not connected'));
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve((rows as T[]) || []);
      });
    });
  }

  async createJob(
    id: string,
    status: JobRecord['status'],
    expiresAt: string,
    instanceUrl: string,
    username: string,
  ): Promise<JobRecord> {
    const createdAt = new Date().toISOString();
    const query = `
      INSERT INTO jobs (id, status, progress, totalFiles, currentFile, zipKey, createdAt, expiresAt, instanceUrl, username)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      id,
      status,
      0,
      0,
      null,
      null,
      createdAt,
      expiresAt,
      instanceUrl,
      username,
    ];
    await this.run(query, params);

    return {
      id,
      status,
      progress: 0,
      totalFiles: 0,
      currentFile: null,
      zipKey: null,
      createdAt,
      downloadedAt: null,
      expiresAt,
      error: null,
      instanceUrl,
      username,
    };
  }

  async getJob(id: string): Promise<JobRecord | null> {
    const query = `SELECT * FROM jobs WHERE id = ?`;
    return this.get<JobRecord>(query, [id]);
  }

  async getAllJobs(
    instanceUrl?: string,
    username?: string,
  ): Promise<JobRecord[]> {
    if (instanceUrl && username) {
      const query = `SELECT * FROM jobs WHERE instanceUrl = ? AND username = ? ORDER BY createdAt DESC`;
      return this.all<JobRecord>(query, [instanceUrl, username]);
    }
    const query = `SELECT * FROM jobs ORDER BY createdAt DESC`;
    return this.all<JobRecord>(query);
  }

  async getExpiredJobs(now: string): Promise<JobRecord[]> {
    const query = `SELECT * FROM jobs WHERE expiresAt < ? AND status != 'expired'`;
    return this.all<JobRecord>(query, [now]);
  }

  async resetHangingJobs(): Promise<void> {
    const query = `
      UPDATE jobs
      SET status = 'failed', error = 'Server restarted or job aborted.'
      WHERE status IN ('queued', 'processing', 'uploading')
    `;
    await this.run(query);
  }

  async updateJobProgress(
    id: string,
    progress: number,
    totalFiles: number,
    currentFile: string | null,
  ): Promise<void> {
    const query = `
      UPDATE jobs
      SET progress = ?, totalFiles = ?, currentFile = ?
      WHERE id = ?
    `;
    await this.run(query, [progress, totalFiles, currentFile, id]);
  }

  async updateJobStatus(
    id: string,
    status: JobRecord['status'],
    options: Partial<
      Pick<JobRecord, 'zipKey' | 'error' | 'expiresAt' | 'downloadedAt'>
    > = {},
  ): Promise<void> {
    const fields: string[] = ['status = ?'];
    const params: unknown[] = [status];

    if (options.zipKey !== undefined) {
      fields.push('zipKey = ?');
      params.push(options.zipKey);
    }
    if (options.error !== undefined) {
      fields.push('error = ?');
      params.push(options.error);
    }
    if (options.expiresAt !== undefined) {
      fields.push('expiresAt = ?');
      params.push(options.expiresAt);
    }
    if (options.downloadedAt !== undefined) {
      fields.push('downloadedAt = ?');
      params.push(options.downloadedAt);
    }

    params.push(id);
    const query = `UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`;
    await this.run(query, params);
  }
}
