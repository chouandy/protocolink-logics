import { BigNumberish } from 'ethers';
import { TokenList } from '@uniswap/token-lists';
import { Vault__factory } from './contracts';
import { axios } from 'src/utils';
import * as common from '@protocolink/common';
import * as core from '@protocolink/core';
import { getContractAddress, supportedChainIds } from './configs';

export type FlashLoanLogicTokenList = common.Token[];

export type FlashLoanLogicFields = core.FlashLoanFields;

@core.LogicDefinitionDecorator()
export class FlashLoanLogic extends core.Logic implements core.LogicTokenListInterface, core.LogicBuilderInterface {
  static readonly supportedChainIds = supportedChainIds;

  async getTokenList() {
    const { data } = await axios.get<TokenList>(
      'https://raw.githubusercontent.com/balancer/tokenlists/main/generated/listed-old.tokenlist.json'
    );

    const tmp: Record<string, boolean> = {};
    const tokenList: FlashLoanLogicTokenList = [];
    for (const { chainId, address, decimals, symbol, name } of data.tokens) {
      if (tmp[address] || chainId !== this.chainId || !name || !symbol || !decimals) continue;
      tokenList.push(new common.Token(chainId, address, decimals, symbol, name));
      tmp[address] = true;
    }

    return tokenList;
  }

  async build(fields: FlashLoanLogicFields) {
    const { outputs, params } = fields;

    const to = getContractAddress(this.chainId, 'Vault');

    const assets: string[] = [];
    const amounts: BigNumberish[] = [];
    for (const output of common.sortByAddress(outputs.toArray())) {
      assets.push(output.token.address);
      amounts.push(output.amountWei);
    }
    const data = Vault__factory.createInterface().encodeFunctionData('flashLoan', [
      getContractAddress(this.chainId, 'BalancerV2FlashLoanCallback'),
      assets,
      amounts,
      params,
    ]);

    const callback = getContractAddress(this.chainId, 'BalancerV2FlashLoanCallback');

    return core.newLogic({ to, data, callback });
  }
}
