import { Comet__factory } from './contracts';
import { Service } from './service';
import * as common from '@protocolink/common';
import { constants } from 'ethers';
import * as core from '@protocolink/core';
import { getMarket, getMarkets, supportedChainIds } from './configs';

export type WithdrawBaseLogicTokenList = Record<string, [common.Token, common.Token][]>;

export type WithdrawBaseLogicParams = core.TokenToTokenExactInParams<{ marketId: string }>;

export type WithdrawBaseLogicFields = core.TokenToTokenExactInFields<{ marketId: string }>;

export type WithdrawBaseLogicOptions = Pick<core.GlobalOptions, 'account'>;

@core.LogicDefinitionDecorator()
export class WithdrawBaseLogic
  extends core.Logic
  implements core.LogicTokenListInterface, core.LogicOracleInterface, core.LogicBuilderInterface
{
  static readonly supportedChainIds = supportedChainIds;

  async getTokenList() {
    const tokenList: WithdrawBaseLogicTokenList = {};

    const markets = getMarkets(this.chainId);
    const service = new Service(this.chainId, this.provider);
    for (const market of markets) {
      const { cToken, baseToken } = await service.getCometTokens(market.id);
      tokenList[market.id] = [];
      if (baseToken.isWrapped) {
        tokenList[market.id].push([cToken, baseToken.unwrapped]);
      }
      tokenList[market.id].push([cToken, baseToken]);
    }

    return tokenList;
  }

  async quote(params: WithdrawBaseLogicParams) {
    const { marketId, input, tokenOut } = params;
    const output = new common.TokenAmount(tokenOut, input.amount);

    return { marketId, input, output };
  }

  async build(fields: WithdrawBaseLogicFields) {
    const { marketId, input, output, balanceBps } = fields;

    const market = getMarket(this.chainId, marketId);
    const tokenOut = output.token.wrapped;
    const amountWei = balanceBps ? input.amountWei : constants.MaxUint256;

    const to = market.cometAddress;
    const data = Comet__factory.createInterface().encodeFunctionData('withdraw', [tokenOut.address, amountWei]);
    const amountOffset = balanceBps ? common.getParamOffset(1) : undefined;
    const inputs = [core.newLogicInput({ input, balanceBps, amountOffset })];
    const wrapMode = output.token.isNative ? core.WrapMode.unwrapAfter : core.WrapMode.none;

    return core.newLogic({ to, data, inputs, wrapMode });
  }
}
