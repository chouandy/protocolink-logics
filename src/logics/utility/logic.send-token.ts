import { BigNumberish, utils } from 'ethers';
import { axios } from 'src/utils';
import * as common from '@protocolink/common';
import * as core from '@protocolink/core';

export type SendTokenLogicTokenList = common.Token[];

export type SendTokenLogicFields = core.TokenToUserFields;

@core.LogicDefinitionDecorator()
export class SendTokenLogic extends core.Logic implements core.LogicTokenListInterface, core.LogicBuilderInterface {
  static readonly supportedChainIds = [
    common.ChainId.mainnet,
    common.ChainId.polygon,
    common.ChainId.arbitrum,
    common.ChainId.optimism,
    common.ChainId.avalanche,
    common.ChainId.fantom,
  ];

  async getTokenList() {
    const { data } = await axios.get<{
      tokens: Record<string, { symbol: string; name: string; decimals: number; address: string }>;
    }>(`https://api.1inch.io/v5.0/${this.chainId}/tokens`);

    const tokenList: SendTokenLogicTokenList = [];
    Object.keys(data.tokens).forEach((key) => {
      const token = data.tokens[key];
      const address = utils.getAddress(token.address);
      tokenList.push(
        address === common.ELASTIC_ADDRESS
          ? this.nativeToken
          : new common.Token(this.chainId, address, token.decimals, token.symbol, token.name)
      );
    });

    return tokenList;
  }

  async build(fields: SendTokenLogicFields) {
    const { input, recipient, balanceBps } = fields;

    let to: string;
    let data: string;
    let amountOffset: BigNumberish | undefined;
    if (input.token.isNative) {
      to = recipient;
      data = '0x';
      if (balanceBps) amountOffset = core.OFFSET_NOT_USED;
    } else {
      to = input.token.address;
      data = common.ERC20__factory.createInterface().encodeFunctionData('transfer', [recipient, input.amountWei]);
      if (balanceBps) amountOffset = common.getParamOffset(1);
    }
    const inputs = [core.newLogicInput({ input, balanceBps, amountOffset })];

    return core.newLogic({ to, data, inputs });
  }
}
