import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { ExportService } from './export/export.service';

describe('AppController', () => {
  let appController: AppController;
  let exportService: ExportService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: ExportService,
          useValue: {
            triggerExport: jest.fn(),
            getAllJobs: jest.fn(),
            getJob: jest.fn(),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    exportService = app.get<ExportService>(ExportService);
  });

  describe('root', () => {
    it('should be defined', () => {
      expect(appController).toBeDefined();
      expect(exportService).toBeDefined();
    });
  });
});
