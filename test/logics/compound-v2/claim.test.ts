import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { claimToken, getChainId, mainnetTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import * as compoundv2 from 'src/logics/compound-v2';
import * as core from '@protocolink/core';
import { expect } from 'chai';
import * as helpers from './helpers';
import hre from 'hardhat';
import * as hrehelpers from '@nomicfoundation/hardhat-network-helpers';

describe('Test CompoundV2 Claim Logic', function () {
  let chainId: number;
  let users: SignerWithAddress[];

  before(async function () {
    chainId = await getChainId();
    const [, user1, user2] = await hre.ethers.getSigners();
    users = [user1, user2];
    await claimToken(chainId, user1.address, mainnetTokens.USDC, '5000');
  });

  snapshotAndRevertEach();

  // https://app.compound.finance/markets?market=1_Compound+V2_0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B
  const testCases = [
    {
      ownerIndex: 0,
      claimerIndex: 0,
      supply: new common.TokenAmount(compoundv2.underlyingTokens.ETH, '1'),
      borrow: new common.TokenAmount(compoundv2.underlyingTokens.USDC, '100'),
    },
    {
      ownerIndex: 0,
      claimerIndex: 0,
      supply: new common.TokenAmount(compoundv2.underlyingTokens.USDC, '3000'),
      borrow: new common.TokenAmount(compoundv2.underlyingTokens.ETH, '1'),
    },
    {
      ownerIndex: 0,
      claimerIndex: 1,
      supply: new common.TokenAmount(compoundv2.underlyingTokens.ETH, '1'),
      borrow: new common.TokenAmount(compoundv2.underlyingTokens.USDC, '100'),
    },
    {
      ownerIndex: 0,
      claimerIndex: 1,
      supply: new common.TokenAmount(compoundv2.underlyingTokens.USDC, '3000'),
      borrow: new common.TokenAmount(compoundv2.underlyingTokens.ETH, '1'),
    },
  ];

  testCases.forEach(({ ownerIndex, claimerIndex, supply, borrow }, i) => {
    it(`case ${i + 1}`, async function () {
      const owner = users[ownerIndex];
      const claimer = users[claimerIndex];

      // 1. supply, enterMarkets and borrow first
      await helpers.supply(owner, supply);
      await helpers.enterMarkets(owner, [supply.token]);
      await helpers.borrow(owner, borrow);

      // 2. get allocated COMP amount after 1000 blocks
      await hrehelpers.mine(1000);
      const logicCompoundV2Claim = new compoundv2.ClaimLogic(chainId, hre.ethers.provider);
      const { output } = await logicCompoundV2Claim.quote({ owner: owner.address });
      expect(output.amountWei).to.be.gt(0);

      // 3. build router logics
      const routerLogics: core.IParam.LogicStruct[] = [];
      routerLogics.push(await logicCompoundV2Claim.build({ owner: owner.address, output }));

      // 4. send router tx
      const transactionRequest = core.newRouterExecuteTransactionRequest({ chainId, routerLogics });
      await expect(claimer.sendTransaction(transactionRequest)).to.not.be.reverted;
      await expect(owner.address).to.changeBalance(output.token, output.amount, 1);
    });
  });
});
