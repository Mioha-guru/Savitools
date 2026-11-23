import { BadRequestException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FederationController } from './federation.controller';
import { FederationService } from './federation.service';
import { ResolveQueryDto } from './dto/resolve-query.dto';
import { TomlQueryDto } from './dto/toml-query.dto';
import { AssetMetadataQueryDto } from './dto/asset-metadata-query.dto';
import { HomeDomainQueryDto } from './dto/home-domain-query.dto';
import { SepQueryDto } from './dto/sep-query.dto';
import { DiagnosticsQueryDto } from './dto/diagnostics-query.dto';
import { LinkPreviewQueryDto } from './dto/link-preview-query.dto';

describe('FederationController', () => {
  let controller: FederationController;
  let federationService: jest.Mocked<Partial<FederationService>>;

  const validIssuer = 'GDJ47UQJNT6UOMV3CLNZ43XGDKOUM3UHV7V3FF3W4KMIRRNICNSS2N2H';

  beforeEach(() => {
    federationService = {
      resolveFederation: jest.fn(),
      getToml: jest.fn(),
      getAssetMetadata: jest.fn(),
      validateHomeDomain: jest.fn(),
      getSepSupport: jest.fn(),
      getServerDiagnostics: jest.fn(),
      buildTransferRequestLink: jest.fn(),
    };

    controller = new FederationController(federationService as unknown as FederationService);
  });

  describe('controller method delegations', () => {
    describe('resolve', () => {
      it('delegates to federationService.resolveFederation and returns resolved record', async () => {
        const query: ResolveQueryDto = { address: 'alice*stellar.org' };
        const expected = {
          account_id: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7',
          memo_type: 'text',
          memo: '12345',
        };
        federationService.resolveFederation = jest.fn().mockResolvedValue(expected);

        const result = await controller.resolve(query);

        expect(federationService.resolveFederation).toHaveBeenCalledWith(query.address);
        expect(result).toEqual(expected);
      });

      it('propagates BadRequestException when federation address cannot be resolved', async () => {
        const query: ResolveQueryDto = { address: 'invalid*unknown.domain' };
        federationService.resolveFederation = jest
          .fn()
          .mockRejectedValue(new BadRequestException('Invalid federation address'));

        await expect(controller.resolve(query)).rejects.toThrow(BadRequestException);
      });
    });

    describe('getToml', () => {
      it('delegates to federationService.getToml and returns parsed toml', async () => {
        const query: TomlQueryDto = { domain: 'stellar.org' };
        const expected = {
          FEDERATION_SERVER: 'https://federation.stellar.org',
          DOCUMENTATION: { ORG_NAME: 'Stellar Development Foundation' },
        };
        federationService.getToml = jest.fn().mockResolvedValue(expected);

        const result = await controller.getToml(query);

        expect(federationService.getToml).toHaveBeenCalledWith(query.domain);
        expect(result).toEqual(expected);
      });

      it('propagates NotFoundException when stellar.toml does not exist', async () => {
        const query: TomlQueryDto = { domain: 'missing.org' };
        federationService.getToml = jest
          .fn()
          .mockRejectedValue(new NotFoundException('stellar.toml not found'));

        await expect(controller.getToml(query)).rejects.toThrow(NotFoundException);
      });
    });

    describe('getAssetMetadata', () => {
      it('delegates to federationService.getAssetMetadata', async () => {
        const query: AssetMetadataQueryDto = {
          domain: 'example.com',
          code: 'USDC',
          issuer: validIssuer,
        };
        const expected = {
          code: 'USDC',
          issuer: validIssuer,
          name: 'USD Coin',
          desc: 'Stablecoin pegged to USD',
        };
        federationService.getAssetMetadata = jest.fn().mockResolvedValue(expected);

        const result = await controller.getAssetMetadata(query);

        expect(federationService.getAssetMetadata).toHaveBeenCalledWith(
          query.domain,
          query.code,
          query.issuer,
        );
        expect(result).toEqual(expected);
      });

      it('propagates errors when asset is not declared in toml', async () => {
        const query: AssetMetadataQueryDto = {
          domain: 'example.com',
          code: 'UNKNOWN',
          issuer: validIssuer,
        };
        federationService.getAssetMetadata = jest
          .fn()
          .mockRejectedValue(new BadRequestException('Asset not declared in stellar.toml'));

        await expect(controller.getAssetMetadata(query)).rejects.toThrow(BadRequestException);
      });
    });

    describe('validateHomeDomain', () => {
      it('delegates to federationService.validateHomeDomain', async () => {
        const query: HomeDomainQueryDto = {
          domain: 'example.com',
          issuer: validIssuer,
        };
        const expected = { valid: true, domain: 'example.com', issuer: validIssuer };
        federationService.validateHomeDomain = jest.fn().mockResolvedValue(expected);

        const result = await controller.validateHomeDomain(query);

        expect(federationService.validateHomeDomain).toHaveBeenCalledWith(
          query.domain,
          query.issuer,
        );
        expect(result).toEqual(expected);
      });

      it('propagates error when home domain validation fails', async () => {
        const query: HomeDomainQueryDto = {
          domain: 'example.com',
          issuer: validIssuer,
        };
        federationService.validateHomeDomain = jest
          .fn()
          .mockRejectedValue(new BadRequestException('Domain mismatch'));

        await expect(controller.validateHomeDomain(query)).rejects.toThrow(BadRequestException);
      });
    });

    describe('getSepSupport', () => {
      it('delegates to federationService.getSepSupport and returns supported SEPs', async () => {
        const query: SepQueryDto = { domain: 'stellar.org' };
        const expected = {
          sep1: true,
          sep2: true,
          sep6: false,
          sep24: true,
        };
        federationService.getSepSupport = jest.fn().mockResolvedValue(expected);

        const result = await controller.getSepSupport(query);

        expect(federationService.getSepSupport).toHaveBeenCalledWith(query.domain);
        expect(result).toEqual(expected);
      });
    });

    describe('getDiagnostics', () => {
      it('delegates to federationService.getServerDiagnostics', async () => {
        const query: DiagnosticsQueryDto = { domain: 'stellar.org' };
        const expected = {
          domain: 'stellar.org',
          tomlFound: true,
          federationServer: 'https://federation.stellar.org',
          forwardLookup: { success: true },
          reverseLookup: { success: true },
        };
        federationService.getServerDiagnostics = jest.fn().mockResolvedValue(expected as never);

        const result = await controller.getDiagnostics(query);

        expect(federationService.getServerDiagnostics).toHaveBeenCalledWith(query.domain);
        expect(result).toEqual(expected);
      });
    });

    describe('getLinkPreview', () => {
      it('delegates to federationService.buildTransferRequestLink with query parameters', async () => {
        const query: LinkPreviewQueryDto = {
          domain: 'stellar.org',
          sep: '6',
          asset: 'USDC',
          amount: '100.50',
          memo: 'test-memo',
          callback: 'https://app.example.com/callback',
          account: 'GA...',
        };
        const expected = {
          url: 'https://anchor.stellar.org/sep6/deposit?asset=USDC&amount=100.50',
          method: 'GET',
        };
        federationService.buildTransferRequestLink = jest.fn().mockReturnValue(expected);

        const result = await controller.getLinkPreview(query);

        expect(federationService.buildTransferRequestLink).toHaveBeenCalledWith(query.domain, {
          sep: query.sep,
          asset: query.asset,
          amount: query.amount,
          memo: query.memo,
          callback: query.callback,
          account: query.account,
        });
        expect(result).toEqual(expected);
      });

      it('propagates error from buildTransferRequestLink', () => {
        const query: LinkPreviewQueryDto = {
          domain: 'stellar.org',
          sep: '24',
          asset: 'INVALID',
          amount: '50',
        };
        federationService.buildTransferRequestLink = jest.fn().mockImplementation(() => {
          throw new BadRequestException('Asset not supported for SEP-24');
        });

        expect(() => controller.getLinkPreview(query)).toThrow(BadRequestException);
      });
    });
  });

  describe('query DTO validation', () => {
    describe('ResolveQueryDto', () => {
      it('passes validation with non-empty address', async () => {
        const dto = plainToInstance(ResolveQueryDto, { address: 'alice*stellar.org' });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('fails validation when address is empty or missing', async () => {
        const dto = plainToInstance(ResolveQueryDto, { address: '' });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].constraints).toHaveProperty('isNotEmpty');
      });
    });

    describe('TomlQueryDto', () => {
      it('passes validation with non-empty domain', async () => {
        const dto = plainToInstance(TomlQueryDto, { domain: 'stellar.org' });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('fails validation when domain is empty', async () => {
        const dto = plainToInstance(TomlQueryDto, { domain: '' });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].constraints).toHaveProperty('isNotEmpty');
      });
    });

    describe('AssetMetadataQueryDto', () => {
      it('passes validation with valid domain, code, and issuer', async () => {
        const dto = plainToInstance(AssetMetadataQueryDto, {
          domain: 'example.com',
          code: 'USDC',
          issuer: validIssuer,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('fails validation when issuer is not a valid Stellar public key', async () => {
        const dto = plainToInstance(AssetMetadataQueryDto, {
          domain: 'example.com',
          code: 'USDC',
          issuer: 'INVALID_ISSUER_KEY',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'issuer')).toBe(true);
      });

      it('fails validation when code exceeds 12 characters', async () => {
        const dto = plainToInstance(AssetMetadataQueryDto, {
          domain: 'example.com',
          code: 'TOOLONGASSETCODE123',
          issuer: validIssuer,
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'code')).toBe(true);
      });
    });

    describe('HomeDomainQueryDto', () => {
      it('passes validation with valid domain and issuer', async () => {
        const dto = plainToInstance(HomeDomainQueryDto, {
          domain: 'example.com',
          issuer: validIssuer,
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('fails validation with invalid issuer', async () => {
        const dto = plainToInstance(HomeDomainQueryDto, {
          domain: 'example.com',
          issuer: 'not-an-issuer',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe('LinkPreviewQueryDto', () => {
      it('passes validation with valid SEP transfer link parameters', async () => {
        const dto = plainToInstance(LinkPreviewQueryDto, {
          domain: 'stellar.org',
          sep: '6',
          asset: 'USDC',
          amount: '100.50',
          memo: 'test',
        });
        const errors = await validate(dto);
        expect(errors).toHaveLength(0);
      });

      it('fails validation when sep is not 6, 24, or 31', async () => {
        const dto = plainToInstance(LinkPreviewQueryDto, {
          domain: 'stellar.org',
          sep: '99' as never,
          asset: 'USDC',
          amount: '100',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'sep')).toBe(true);
      });

      it('fails validation when amount is not a valid decimal string', async () => {
        const dto = plainToInstance(LinkPreviewQueryDto, {
          domain: 'stellar.org',
          sep: '6',
          asset: 'USDC',
          amount: 'invalid-amount',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((e) => e.property === 'amount')).toBe(true);
      });
    });
  });
});
