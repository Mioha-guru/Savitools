import { BadRequestException } from '@nestjs/common';
import { ComposerController } from './composer.controller';
import { ComposerService } from './composer.service';
import { TransactionSequenceService } from './transaction-sequence.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BuildTransactionDto } from './dto/build-transaction.dto';
import { FeeBumpDto } from './dto/fee-bump.dto';
import { SimulateTransactionDto } from './dto/simulate-transaction.dto';
import { SimulateWithDiffDto } from './dto/simulate-with-diff.dto';
import { BenchmarkTransactionDto } from './dto/benchmark-transaction.dto';
import { RunTransactionSequenceDto } from './dto/transaction-sequence.dto';

describe('ComposerController', () => {
  let controller: ComposerController;
  let composerService: jest.Mocked<Partial<ComposerService>>;
  let sequenceService: jest.Mocked<Partial<TransactionSequenceService>>;

  beforeEach(() => {
    composerService = {
      getOperations: jest.fn(),
      buildTransaction: jest.fn(),
      buildFeeBump: jest.fn(),
      simulateTransaction: jest.fn(),
      simulateWithDiff: jest.fn(),
      benchmarkTransaction: jest.fn(),
    };

    sequenceService = {
      run: jest.fn(),
      list: jest.fn(),
    };

    controller = new ComposerController(
      composerService as unknown as ComposerService,
      sequenceService as unknown as TransactionSequenceService,
    );
  });

  describe('guard metadata', () => {
    it('applies JwtAuthGuard to sequence endpoints', () => {
      const runGuards = Reflect.getMetadata('__guards__', controller.runTransactionSequence);
      expect(runGuards).toBeDefined();
      expect(runGuards).toContain(JwtAuthGuard);

      const listGuards = Reflect.getMetadata('__guards__', controller.listTransactionSequences);
      expect(listGuards).toBeDefined();
      expect(listGuards).toContain(JwtAuthGuard);
    });

    it('does not enforce JwtAuthGuard on public builder and simulation endpoints', () => {
      const publicEndpoints = [
        controller.getOperations,
        controller.buildTransaction,
        controller.buildFeeBump,
        controller.simulateTransaction,
        controller.simulateWithDiff,
        controller.benchmarkTransaction,
      ];

      for (const endpoint of publicEndpoints) {
        const guards = Reflect.getMetadata('__guards__', endpoint);
        expect(guards).toBeUndefined();
      }
    });
  });

  describe('getOperations', () => {
    it('returns operation manifest from composerService', () => {
      const manifest = [{ type: 'payment', description: 'Send payment' }];
      composerService.getOperations = jest.fn().mockReturnValue(manifest);

      const result = controller.getOperations();

      expect(composerService.getOperations).toHaveBeenCalled();
      expect(result).toEqual(manifest);
    });
  });

  describe('buildTransaction', () => {
    it('delegates to composerService.buildTransaction', async () => {
      const dto: BuildTransactionDto = {
        sourceAccount: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
        network: 'testnet',
        operations: [],
      } as unknown as BuildTransactionDto;

      const expected = { xdr: 'AAAA...', txHash: 'abc123hash' };
      composerService.buildTransaction = jest.fn().mockResolvedValue(expected);

      const result = await controller.buildTransaction(dto);

      expect(composerService.buildTransaction).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });

    it('propagates errors when build fails', async () => {
      const dto = {} as BuildTransactionDto;
      composerService.buildTransaction = jest
        .fn()
        .mockRejectedValue(new BadRequestException('Invalid source account'));

      await expect(controller.buildTransaction(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('buildFeeBump', () => {
    it('delegates to composerService.buildFeeBump', async () => {
      const dto: FeeBumpDto = {
        innerXdr: 'AAAA...',
        feeSource: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
        baseFee: '1000',
        network: 'testnet',
      };
      const expected = { xdr: 'AAAA_FEE_BUMP...' };
      composerService.buildFeeBump = jest.fn().mockResolvedValue(expected);

      const result = await controller.buildFeeBump(dto);

      expect(composerService.buildFeeBump).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });

    it('propagates BadRequestException on invalid fee bump parameters', async () => {
      const dto = {} as FeeBumpDto;
      composerService.buildFeeBump = jest
        .fn()
        .mockRejectedValue(new BadRequestException('Invalid inner XDR'));

      await expect(controller.buildFeeBump(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('simulateTransaction', () => {
    it('delegates to composerService.simulateTransaction', async () => {
      const dto: SimulateTransactionDto = {
        xdr: 'AAAA...',
        network: 'testnet',
      };
      const expected = { success: true, resultXdr: 'AAAA...' };
      composerService.simulateTransaction = jest.fn().mockResolvedValue(expected);

      const result = await controller.simulateTransaction(dto);

      expect(composerService.simulateTransaction).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('simulateWithDiff', () => {
    it('delegates to composerService.simulateWithDiff', async () => {
      const dto: SimulateWithDiffDto = {
        xdr: 'AAAA...',
        network: 'testnet',
      };
      const expected = {
        success: true,
        diff: [{ account: 'GB...', before: '100', after: '90' }],
      };
      composerService.simulateWithDiff = jest.fn().mockResolvedValue(expected);

      const result = await controller.simulateWithDiff(dto);

      expect(composerService.simulateWithDiff).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('benchmarkTransaction', () => {
    it('delegates to composerService.benchmarkTransaction', async () => {
      const dto: BenchmarkTransactionDto = {
        xdr: 'AAAA...',
        transactionCount: 5,
        concurrency: 2,
        network: 'testnet',
      };
      const expected = {
        sequential: { avgDurationMs: 120 },
        concurrent: { avgDurationMs: 80 },
      };
      composerService.benchmarkTransaction = jest.fn().mockResolvedValue(expected);

      const result = await controller.benchmarkTransaction(dto);

      expect(composerService.benchmarkTransaction).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('runTransactionSequence', () => {
    it('delegates to transactionSequenceService.run', async () => {
      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [],
      };
      const expected = { id: 'seq_123', status: 'succeeded', results: [] };
      sequenceService.run = jest.fn().mockResolvedValue(expected);

      const result = await controller.runTransactionSequence(dto);

      expect(sequenceService.run).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expected);
    });
  });

  describe('listTransactionSequences', () => {
    it('delegates to transactionSequenceService.list', async () => {
      const expected = [{ id: 'seq_123', status: 'succeeded', results: [] }];
      sequenceService.list = jest.fn().mockReturnValue(expected);

      const result = await controller.listTransactionSequences();

      expect(sequenceService.list).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });
  });
});
