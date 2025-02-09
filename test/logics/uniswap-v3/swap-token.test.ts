import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { claimToken, getChainId, mainnetTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import * as core from '@protocolink/core';
import { expect } from 'chai';
import hre from 'hardhat';
import * as uniswapv3 from 'src/logics/uniswap-v3';
import * as utils from 'test/utils';

describe('Test UniswapV3 SwapToken Logic', function () {
  let chainId: number;
  let user: SignerWithAddress;

  before(async function () {
    chainId = await getChainId();
    [, user] = await hre.ethers.getSigners();
    await claimToken(chainId, user.address, mainnetTokens.USDC, '5000');
  });

  snapshotAndRevertEach();

  const testCases = [
    {
      params: {
        input: new common.TokenAmount(mainnetTokens.ETH, '1'),
        tokenOut: mainnetTokens.USDC,
        slippage: 100,
      },
    },
    {
      params: {
        input: new common.TokenAmount(mainnetTokens.USDC, '1000'),
        tokenOut: mainnetTokens.ETH,
        slippage: 100,
      },
    },
    {
      params: {
        input: new common.TokenAmount(mainnetTokens.USDC, '1000'),
        tokenOut: mainnetTokens.DAI,
        slippage: 100,
      },
    },
    {
      params: {
        input: new common.TokenAmount(mainnetTokens.ETH, '1'),
        tokenOut: mainnetTokens.USDC,
        slippage: 100,
      },
      balanceBps: 5000,
    },
    {
      params: {
        input: new common.TokenAmount(mainnetTokens.USDC, '1000'),
        tokenOut: mainnetTokens.ETH,
        slippage: 100,
      },
      balanceBps: 5000,
    },
    {
      params: {
        input: new common.TokenAmount(mainnetTokens.USDC, '1000'),
        tokenOut: mainnetTokens.DAI,
        slippage: 100,
      },
      balanceBps: 5000,
    },
    {
      params: {
        tokenIn: mainnetTokens.ETH,
        output: new common.TokenAmount(mainnetTokens.USDC, '1000'),
        slippage: 100,
      },
    },
    {
      params: {
        tokenIn: mainnetTokens.USDC,
        output: new common.TokenAmount(mainnetTokens.ETH, '1'),
        slippage: 100,
      },
    },
    {
      params: {
        tokenIn: mainnetTokens.USDC,
        output: new common.TokenAmount(mainnetTokens.DAI, '1000'),
        slippage: 100,
      },
    },
  ];

  testCases.forEach(({ params, balanceBps }, i) => {
    it(`case ${i + 1}`, async function () {
      // 1. get input or output
      const logicUniswapV3SwapToken = new uniswapv3.SwapTokenLogic(chainId);
      const quotation = await logicUniswapV3SwapToken.quote(params);
      const { tradeType, input, output } = quotation;

      // 2. build funds, tokensReturn
      const tokensReturn = [output.token.elasticAddress];
      const funds = new common.TokenAmounts();
      if (balanceBps) {
        funds.add(utils.calcRequiredAmountByBalanceBps(input, balanceBps));
        tokensReturn.push(input.token.elasticAddress);
      } else {
        funds.add(input);
      }

      // 3. build router logics
      const erc20Funds = funds.erc20;
      const routerLogics = await utils.getPermitAndPullTokenRouterLogics(chainId, user, erc20Funds);
      routerLogics.push(await logicUniswapV3SwapToken.build(quotation, { account: user.address }));

      // 4. send router tx
      const transactionRequest = core.newRouterExecuteTransactionRequest({
        chainId,
        routerLogics,
        tokensReturn,
        value: funds.native?.amountWei ?? 0,
      });
      await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;
      if (tradeType === core.TradeType.exactIn) {
        await expect(user.address).to.changeBalance(input.token, -input.amount);
        await expect(user.address).to.changeBalance(output.token, output.amount, 100);
      } else {
        await expect(user.address).to.changeBalance(input.token, -input.amount, 100);
        await expect(user.address).to.changeBalance(output.token, output.amount);
      }
    });
  });
});
