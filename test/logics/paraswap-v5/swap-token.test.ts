import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { claimToken, getChainId, mainnetTokens, snapshotAndRevertEach } from '@protocolink/test-helpers';
import * as common from '@protocolink/common';
import * as core from '@protocolink/core';
import { expect } from 'chai';
import hre from 'hardhat';
import * as paraswapv5 from 'src/logics/paraswap-v5';
import * as utils from 'test/utils';

describe('Test ParaswapV5 SwapToken Logic', function () {
  let chainId: number;
  let user: SignerWithAddress;

  before(async function () {
    chainId = await getChainId();
    [, user] = await hre.ethers.getSigners();
    await claimToken(chainId, user.address, mainnetTokens.ETH, '100');
    await claimToken(chainId, user.address, mainnetTokens.USDC, '100');
  });

  snapshotAndRevertEach();

  const testCases = [
    {
      input: new common.TokenAmount(mainnetTokens.ETH, '1'),
      tokenOut: mainnetTokens.USDC,
      slippage: 500,
    },
    {
      input: new common.TokenAmount(mainnetTokens.USDC, '1'),
      tokenOut: mainnetTokens.ETH,
      slippage: 500,
    },
    {
      input: new common.TokenAmount(mainnetTokens.USDC, '1'),
      tokenOut: mainnetTokens.DAI,
      slippage: 500,
    },
  ];

  testCases.forEach(({ input, tokenOut, slippage }, i) => {
    it(`case ${i + 1}`, async function () {
      // 1. get output
      const logicParaswapV5SwapToken = new paraswapv5.SwapTokenLogic(chainId);
      const quotation = await logicParaswapV5SwapToken.quote({ input, tokenOut, slippage });
      const { output } = quotation;

      // 2. build funds, tokensReturn
      const funds = new common.TokenAmounts(input);
      const tokensReturn = [output.token.elasticAddress];

      // 3. build router logics
      const erc20Funds = funds.erc20;
      const routerLogics = await utils.getPermitAndPullTokenRouterLogics(chainId, user, erc20Funds);
      routerLogics.push(await logicParaswapV5SwapToken.build(quotation, { account: user.address }));

      // 4. send router tx
      const transactionRequest = core.newRouterExecuteTransactionRequest({
        chainId,
        routerLogics,
        tokensReturn,
        value: funds.native?.amountWei ?? 0,
      });
      await expect(user.sendTransaction(transactionRequest)).to.not.be.reverted;
      await expect(user.address).to.changeBalance(input.token, -input.amount);
      await expect(user.address).to.changeBalance(output.token, output.amount, 100);
    });
  });
});
