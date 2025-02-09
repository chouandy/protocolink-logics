import * as aavev2 from 'src/logics/aave-v2';
import * as aavev3 from 'src/logics/aave-v3';
import * as balancerv2 from 'src/logics/balancer-v2';
import * as common from '@protocolink/common';
import * as core from '@protocolink/core';
import { getChainId } from '@protocolink/test-helpers';

export async function setup() {
  const hre = await import('hardhat');
  const [deployer] = await hre.ethers.getSigners();
  const chainId = await getChainId();

  // deploy Router
  const router = await (
    await new core.Router__factory()
      .connect(deployer)
      .deploy(common.getWrappedNativeToken(chainId).address, deployer.address, deployer.address, deployer.address)
  ).deployed();
  core.setContractAddress(chainId, 'Router', router.address);
  const agentImplementation = await router.agentImplementation();
  core.setContractAddress(chainId, 'AgentImplementation', agentImplementation);

  // deploy AaveV2FlashLoanCallback
  const aaveV2Service = new aavev2.Service(chainId, hre.ethers.provider);
  const aaveV2AddressesProvider = await aaveV2Service.protocolDataProvider.ADDRESSES_PROVIDER();
  const aaveV2FlashLoanCallback = await (
    await new aavev2.AaveV2FlashLoanCallback__factory()
      .connect(deployer)
      .deploy(router.address, aaveV2AddressesProvider)
  ).deployed();
  aavev2.setContractAddress(chainId, 'AaveV2FlashLoanCallback', aaveV2FlashLoanCallback.address);

  // deploy AaveV3FlashLoanCallback
  const aaveV3Service = new aavev3.Service(chainId, hre.ethers.provider);
  const aaveV3AddressesProvider = await aaveV3Service.poolDataProvider.ADDRESSES_PROVIDER();
  const aaveV3FlashLoanCallback = await (
    await new aavev3.AaveV3FlashLoanCallback__factory()
      .connect(deployer)
      .deploy(router.address, aaveV3AddressesProvider)
  ).deployed();
  aavev3.setContractAddress(chainId, 'AaveV3FlashLoanCallback', aaveV3FlashLoanCallback.address);

  // deploy BalancerV2FlashLoanCallback
  const balancerV2FlashLoanCallback = await (
    await new balancerv2.BalancerV2FlashLoanCallback__factory()
      .connect(deployer)
      .deploy(router.address, balancerv2.getContractAddress(chainId, 'Vault'))
  ).deployed();
  balancerv2.setContractAddress(chainId, 'BalancerV2FlashLoanCallback', balancerV2FlashLoanCallback.address);
}
