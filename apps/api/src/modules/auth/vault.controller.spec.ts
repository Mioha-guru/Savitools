import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VaultController } from './vault.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CreateVaultKeyDto } from './dto/create-vault-key.dto';
import { VaultKeyProvider } from './entities/vault-key.entity';

describe('VaultController', () => {
  let controller: VaultController;
  let authService: jest.Mocked<Partial<AuthService>>;

  const mockUser = { id: 'user-uuid-1' };

  beforeEach(() => {
    authService = {
      createVaultKey: jest.fn(),
      listVaultKeys: jest.fn(),
      deleteVaultKey: jest.fn(),
    };

    controller = new VaultController(authService as unknown as AuthService);
  });

  describe('guard metadata', () => {
    it('applies JwtAuthGuard at class level', () => {
      const guards = Reflect.getMetadata('__guards__', VaultController);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('create', () => {
    const dto: CreateVaultKeyDto = {
      name: 'Fluxa Secret',
      provider: VaultKeyProvider.FLUXA,
      key: 'secret-key-12345',
    };

    it('delegates to authService.createVaultKey with user ID and DTO', async () => {
      const createdKey = {
        id: 'vault-uuid-1',
        name: dto.name,
        provider: dto.provider,
        createdAt: new Date(),
      };
      authService.createVaultKey = jest.fn().mockResolvedValue(createdKey);

      const result = await controller.create(dto, mockUser);

      expect(authService.createVaultKey).toHaveBeenCalledWith(mockUser.id, dto);
      expect(result).toEqual(createdKey);
    });

    it('propagates BadRequestException on invalid key parameters', async () => {
      authService.createVaultKey = jest
        .fn()
        .mockRejectedValue(new BadRequestException('Invalid vault key'));

      await expect(controller.create(dto, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  describe('list', () => {
    it('delegates to authService.listVaultKeys with user ID', async () => {
      const keys = [
        {
          id: 'vault-uuid-1',
          name: 'Fluxa Secret',
          provider: VaultKeyProvider.FLUXA,
          createdAt: new Date(),
        },
      ];
      authService.listVaultKeys = jest.fn().mockResolvedValue(keys);

      const result = await controller.list(mockUser);

      expect(authService.listVaultKeys).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(keys);
    });

    it('returns empty array when user has no stored vault keys', async () => {
      authService.listVaultKeys = jest.fn().mockResolvedValue([]);

      const result = await controller.list(mockUser);

      expect(authService.listVaultKeys).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual([]);
    });
  });

  describe('remove', () => {
    it('delegates to authService.deleteVaultKey and returns { success: true }', async () => {
      authService.deleteVaultKey = jest.fn().mockResolvedValue(undefined);

      const result = await controller.remove('vault-uuid-1', mockUser);

      expect(authService.deleteVaultKey).toHaveBeenCalledWith('vault-uuid-1', mockUser.id);
      expect(result).toEqual({ success: true });
    });

    it('propagates NotFoundException when key does not exist', async () => {
      authService.deleteVaultKey = jest
        .fn()
        .mockRejectedValue(new NotFoundException('Key not found'));

      await expect(controller.remove('missing-key-id', mockUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(authService.deleteVaultKey).toHaveBeenCalledWith('missing-key-id', mockUser.id);
    });
  });
});
