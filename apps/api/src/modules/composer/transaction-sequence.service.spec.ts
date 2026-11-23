import { BadRequestException } from '@nestjs/common';
import { Asset, Keypair, Operation } from '@stellar/stellar-sdk';
import { TransactionSequenceService } from './transaction-sequence.service';
import { ComposerService } from './composer.service';
import { RunTransactionSequenceDto } from './dto/transaction-sequence.dto';

describe('TransactionSequenceService', () => {
  let service: TransactionSequenceService;
  let composerService: jest.Mocked<Partial<ComposerService>>;

  const sourceAccount1 = Keypair.random().publicKey();
  const sourceAccount2 = Keypair.random().publicKey();
  const destinationAccount = Keypair.random().publicKey();

  beforeEach(() => {
    composerService = {
      loadSequenceNumber: jest.fn().mockResolvedValue('1000'),
      mapOperation: jest.fn((op: { destination?: string }) =>
        Operation.payment({
          destination: op.destination || destinationAccount,
          asset: Asset.native(),
          amount: '10',
        }),
      ) as never,
    };

    service = new TransactionSequenceService(composerService as unknown as ComposerService);
  });

  describe('validation', () => {
    it('throws BadRequestException when steps array is empty', async () => {
      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [],
      };

      await expect(service.run(dto)).rejects.toThrow(BadRequestException);
      await expect(service.run(dto)).rejects.toThrow(
        'Transaction sequence must contain at least one step',
      );
    });

    it('throws BadRequestException on forward step reference', async () => {
      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: { step: 1 },
            operations: [{ type: 'payment' }],
          },
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
        ],
      };

      await expect(service.run(dto)).rejects.toThrow(BadRequestException);
      await expect(service.run(dto)).rejects.toThrow('invalid source reference');
    });

    it('throws BadRequestException on self-referential step reference', async () => {
      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: { step: 0 },
            operations: [{ type: 'payment' }],
          },
        ],
      };

      await expect(service.run(dto)).rejects.toThrow(BadRequestException);
      await expect(service.run(dto)).rejects.toThrow('invalid source reference');
    });

    it('throws BadRequestException on negative step reference', async () => {
      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: { step: -1 },
            operations: [{ type: 'payment' }],
          },
        ],
      };

      await expect(service.run(dto)).rejects.toThrow(BadRequestException);
      await expect(service.run(dto)).rejects.toThrow('invalid source reference');
    });

    it('throws BadRequestException on non-integer step reference', async () => {
      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: { step: 0.5 },
            operations: [{ type: 'payment' }],
          },
        ],
      };

      await expect(service.run(dto)).rejects.toThrow(BadRequestException);
      await expect(service.run(dto)).rejects.toThrow('invalid source reference');
    });

    it('handles step with missing or invalid source account', async () => {
      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: '',
            operations: [{ type: 'payment' }],
          },
        ],
      };

      const run = await service.run(dto);
      expect(run.status).toBe('failed');
      expect(run.results[0].status).toBe('failed');
      expect(run.results[0].error).toContain('missing a source account');
    });
  });

  describe('dependency resolution and step references', () => {
    it('resolves literal source accounts and creates successful sequence run', async () => {
      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: sourceAccount1,
            operations: [{ type: 'payment', destination: destinationAccount }],
          },
        ],
      };

      const run = await service.run(dto);

      expect(run.id).toMatch(/^seq_/);
      expect(run.status).toBe('succeeded');
      expect(run.results).toHaveLength(1);
      expect(run.results[0]).toEqual(
        expect.objectContaining({
          stepIndex: 0,
          sourceAccount: sourceAccount1,
          status: 'success',
          sequence: 1000,
          nextSequence: 1001,
          txHash: expect.any(String),
          xdr: expect.any(String),
        }),
      );
      expect(composerService.loadSequenceNumber).toHaveBeenCalledWith(sourceAccount1, 'testnet');
    });

    it('resolves step source reference to prior step sourceAccount', async () => {
      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: sourceAccount1,
            operations: [{ type: 'payment', destination: destinationAccount }],
          },
          {
            source: { step: 0, field: 'source' },
            operations: [{ type: 'payment', destination: destinationAccount }],
          },
        ],
      };

      const run = await service.run(dto);

      expect(run.status).toBe('succeeded');
      expect(run.results).toHaveLength(2);
      expect(run.results[1].sourceAccount).toBe(sourceAccount1);
    });

    it('resolves step reference with field: destination to prior step destination', async () => {
      const destKeypair = Keypair.random().publicKey();
      composerService.loadSequenceNumber = jest
        .fn()
        .mockResolvedValueOnce('500')
        .mockResolvedValueOnce('800');

      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: sourceAccount1,
            operations: [{ type: 'payment', destination: destKeypair }],
          },
          {
            source: { step: 0, field: 'destination' },
            operations: [{ type: 'payment', destination: destinationAccount }],
          },
        ],
      };

      const run = await service.run(dto);

      expect(run.status).toBe('succeeded');
      expect(run.results).toHaveLength(2);
      expect(run.results[0].sourceAccount).toBe(sourceAccount1);
      expect(run.results[1].sourceAccount).toBe(destKeypair);
    });

    it('fails when step references a failed prior step', async () => {
      composerService.mapOperation = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('Simulation build error');
        })
        .mockImplementationOnce((op: { destination?: string }) =>
          Operation.payment({
            destination: op.destination || destinationAccount,
            asset: Asset.native(),
            amount: '10',
          }),
        ) as never;

      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: false,
        steps: [
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
          {
            source: { step: 0 },
            operations: [{ type: 'payment' }],
          },
        ],
      };

      const run = await service.run(dto);

      expect(run.status).toBe('failed');
      expect(run.results[0].status).toBe('failed');
      expect(run.results[1].status).toBe('failed');
      expect(run.results[1].error).toContain('references step 0 which has not succeeded');
    });
  });

  describe('sequence number incrementation and caching', () => {
    it('increments sequence number for consecutive steps sharing the same source account without re-fetching', async () => {
      composerService.loadSequenceNumber = jest.fn().mockResolvedValue('100');

      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
        ],
      };

      const run = await service.run(dto);

      expect(run.status).toBe('succeeded');
      expect(composerService.loadSequenceNumber).toHaveBeenCalledTimes(1);
      expect(run.results[0].sequence).toBe(100);
      expect(run.results[0].nextSequence).toBe(101);
      expect(run.results[1].sequence).toBe(101);
      expect(run.results[1].nextSequence).toBe(102);
      expect(run.results[2].sequence).toBe(102);
      expect(run.results[2].nextSequence).toBe(103);
    });

    it('fetches separate sequence numbers for distinct source accounts', async () => {
      composerService.loadSequenceNumber = jest
        .fn()
        .mockResolvedValueOnce('100')
        .mockResolvedValueOnce('200');

      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
          {
            source: sourceAccount2,
            operations: [{ type: 'payment' }],
          },
        ],
      };

      const run = await service.run(dto);

      expect(run.status).toBe('succeeded');
      expect(composerService.loadSequenceNumber).toHaveBeenCalledTimes(2);
      expect(run.results[0].sequence).toBe(100);
      expect(run.results[1].sequence).toBe(200);
    });
  });

  describe('stopOnFailure handling', () => {
    it('halts sequence execution immediately on failure when stopOnFailure is true', async () => {
      composerService.mapOperation = jest
        .fn()
        .mockImplementationOnce((op: { destination?: string }) =>
          Operation.payment({
            destination: op.destination || destinationAccount,
            asset: Asset.native(),
            amount: '10',
          }),
        )
        .mockImplementationOnce(() => {
          throw new Error('Operation build failure');
        })
        .mockImplementationOnce((op: { destination?: string }) =>
          Operation.payment({
            destination: op.destination || destinationAccount,
            asset: Asset.native(),
            amount: '10',
          }),
        ) as never;

      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
        ],
      };

      const run = await service.run(dto);

      expect(run.status).toBe('partial');
      expect(run.results).toHaveLength(2);
      expect(run.results[0].status).toBe('success');
      expect(run.results[1].status).toBe('failed');
      expect(run.results[1].error).toBe('Operation build failure');
    });

    it('continues execution of remaining steps when stopOnFailure is false', async () => {
      composerService.mapOperation = jest
        .fn()
        .mockImplementationOnce((op: { destination?: string }) =>
          Operation.payment({
            destination: op.destination || destinationAccount,
            asset: Asset.native(),
            amount: '10',
          }),
        )
        .mockImplementationOnce(() => {
          throw new Error('Operation build failure');
        })
        .mockImplementationOnce((op: { destination?: string }) =>
          Operation.payment({
            destination: op.destination || destinationAccount,
            asset: Asset.native(),
            amount: '10',
          }),
        ) as never;

      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: false,
        steps: [
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
          {
            source: sourceAccount2,
            operations: [{ type: 'payment' }],
          },
        ],
      };

      const run = await service.run(dto);

      expect(run.status).toBe('partial');
      expect(run.results).toHaveLength(3);
      expect(run.results[0].status).toBe('success');
      expect(run.results[1].status).toBe('failed');
      expect(run.results[2].status).toBe('success');
    });
  });

  describe('history management and pruning', () => {
    it('maintains run history and prunes beyond MAX_HISTORY (100 runs)', async () => {
      const dto: RunTransactionSequenceDto = {
        network: 'testnet',
        stopOnFailure: true,
        steps: [
          {
            source: sourceAccount1,
            operations: [{ type: 'payment' }],
          },
        ],
      };

      for (let i = 0; i < 105; i++) {
        await service.run(dto);
      }

      const history = service.list();
      expect(history).toHaveLength(100);
    });
  });
});
