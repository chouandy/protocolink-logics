import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import * as aavev3 from 'src/logics/aave-v3';
import { claimToken, getChainId, mainnetTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import * as core from '@protocolink/core';
import { expect } from 'chai';
import * as helpers from './helpers';
import hre from 'hardhat';
import * as utils from 'test/utils';

describe('Test AaveV3 Withdraw Logic', function () {
  let chainId: number;
  let user: SignerWithAddress;

  before(async function () {
    chainId = await getChainId();
    [, user] = await hre.ethers.getSigners();
    await claimToken(chainId, user.address, mainnetTokens.WETH, '100');
    await claimToken(chainId, user.address, mainnetTokens.USDC, '100');
  });

  snapshotAndRevertEach();

  const testCases = [
    {
      input: new common.TokenAmount(aavev3.mainnetTokens.aEthWETH, '1'),
      tokenOut: aavev3.mainnetTokens.ETH,
    },
    {
      input: new common.TokenAmount(aavev3.mainnetTokens.aEthWETH, '1'),
      tokenOut: aavev3.mainnetTokens.WETH,
    },
    {
      input: new common.TokenAmount(aavev3.mainnetTokens.aEthUSDC, '1'),
      tokenOut: aavev3.mainnetTokens.USDC,
    },
    {
      input: new common.TokenAmount(aavev3.mainnetTokens.aEthWETH, '1'),
      tokenOut: aavev3.mainnetTokens.ETH,
      balanceBps: 5000,
    },
    {
      input: new common.TokenAmount(aavev3.mainnetTokens.aEthWETH, '1'),
      tokenOut: aavev3.mainnetTokens.WETH,
      balanceBps: 5000,
    },
    {
      input: new common.TokenAmount(aavev3.mainnetTokens.aEthUSDC, '1'),
      tokenOut: aavev3.mainnetTokens.USDC,
      balanceBps: 5000,
    },
  ];

  testCases.forEach(({ input, tokenOut, balanceBps }, i) => {
    it(`case ${i + 1}`, async function () {
      // 1. supply first
      const assetsAmount = new common.TokenAmount(tokenOut, '3');
      await helpers.supply(chainId, user, assetsAmount);

      // 2. get output
      const logicAaveV3Withdraw = new aavev3.WithdrawLogic(chainId);
      const { output } = await logicAaveV3Withdraw.quote({ input, tokenOut });

      // 3. build funds, tokensReturn
      const tokensReturn = [output.token.elasticAddress];
      const funds = new common.TokenAmounts();
      if (balanceBps) {
        funds.add(utils.calcRequiredAmountByBalanceBps(input, balanceBps));
        tokensReturn.push(input.token.elasticAddress);
      } else {
        funds.add(input);
      }

      // 4. build router logics
      const erc20Funds = funds.erc20;
      const routerLogics = await utils.getPermitAndPullTokenRouterLogics(chainId, user, erc20Funds);
      routerLogics.push(await logicAaveV3Withdraw.build({ input, output, balanceBps }, { account: user.address }));

      // 5. send router tx
      const transactionRequest = core.newRouterExecuteTransactionRequest({ chainId, routerLogics, tokensReturn });
      await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;
      await expect(user.address).to.changeBalance(input.token, -input.amount, 1);
      await expect(user.address).to.changeBalance(output.token, output.amount);
    });
  });
});
