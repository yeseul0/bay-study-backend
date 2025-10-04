import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { FactoryABI } from './factoryABI';

export interface CreateStudyDto {
  studyName: string;
  depositAmount: string;
  penaltyAmount: string;
  studyAdmin: string;
  studyStartTime: number;
  studyEndTime: number;
}

@Injectable()
export class FactoryService {
  private readonly logger = new Logger(FactoryService.name);
  private provider: ethers.JsonRpcProvider;
  private factoryContract: ethers.Contract;
  private wallet: ethers.Wallet;

  constructor(private configService: ConfigService) {
    this.initializeFactory();
  }

  private initializeFactory() {
    try {
      const rpcUrl = this.configService.get<string>('RPC_URL') || 'http://localhost:8545';
      this.provider = new ethers.JsonRpcProvider(rpcUrl);

      const privateKey = this.configService.get<string>('PRIVATE_KEY');
      if (!privateKey) {
        throw new Error('PRIVATE_KEY environment variable is required');
      }
      this.wallet = new ethers.Wallet(privateKey, this.provider);

      const factoryAddress = this.configService.get<string>('FACTORY_ADDRESS');
      if (!factoryAddress) {
        throw new Error('FACTORY_ADDRESS environment variable is required');
      }

      this.factoryContract = new ethers.Contract(factoryAddress, FactoryABI, this.wallet);

      this.logger.log('Factory service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize factory service', error);
      throw error;
    }
  }

  async createStudyProxy(studyData: CreateStudyDto): Promise<string> {
    try {
      this.logger.log(`Creating new study proxy: ${studyData.studyName}`);

      // Wei 단위로 변환
      const depositAmountWei = ethers.parseEther(studyData.depositAmount);
      const penaltyAmountWei = ethers.parseEther(studyData.penaltyAmount);

      const tx = await this.factoryContract.createProxy(
        studyData.studyName,
        depositAmountWei,
        penaltyAmountWei,
        studyData.studyAdmin,
        studyData.studyStartTime,
        studyData.studyEndTime
      );

      this.logger.log(`Transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();
      this.logger.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

      // ProxyCreated 이벤트에서 프록시 주소 추출
      const proxyCreatedEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('ProxyCreated(address)')
      );

      if (proxyCreatedEvent) {
        const proxyAddress = ethers.getAddress('0x' + proxyCreatedEvent.topics[1].slice(26));
        this.logger.log(`New proxy created at: ${proxyAddress}`);
        return proxyAddress;
      }

      throw new Error('ProxyCreated event not found');
    } catch (error) {
      this.logger.error('Failed to create study proxy', error);
      throw error;
    }
  }

  async getAllProxies(): Promise<string[]> {
    try {
      const proxies = await this.factoryContract.getProxies();
      return proxies;
    } catch (error) {
      this.logger.error('Failed to get proxy list', error);
      throw error;
    }
  }
}