import { AllowanceTransfer, MaxUint160, PermitBatch, PermitDetails, PermitSingle } from '@uniswap/permit2-sdk';
import { PERMIT_EXPIRATION, PERMIT_SIG_DEADLINE } from './constants';
import { Permit2__factory } from './contracts';
import * as common from '@protocolink/common';
import * as core from '@protocolink/core';
import { getContractAddress, supportedChainIds } from './configs';
import { getDeadline, isPermitSingle } from './utils';

export interface PermitTokenLogicFields {
  permit: PermitSingle | PermitBatch;
  sig: string;
}

export type PermitTokenLogicOptions = Pick<core.GlobalOptions, 'account'>;

@core.LogicDefinitionDecorator()
export class PermitTokenLogic extends core.Logic implements core.LogicBuilderInterface {
  static readonly supportedChainIds = supportedChainIds;

  async getPermitData(account: string, erc20Funds: common.TokenAmounts) {
    const details: PermitDetails[] = [];
    if (!erc20Funds.isEmpty) {
      const iface = Permit2__factory.createInterface();
      const calls: common.Multicall2.CallStruct[] = erc20Funds.map((fund) => ({
        target: getContractAddress(this.chainId, 'Permit2'),
        callData: iface.encodeFunctionData('allowance', [
          account,
          fund.token.address,
          core.calcAccountAgent(this.chainId, account),
        ]),
      }));
      const { returnData } = await this.multicall2.callStatic.aggregate(calls);

      erc20Funds.forEach((fund, i) => {
        const [amount, expiration, nonce] = iface.decodeFunctionResult('allowance', returnData[i]);
        if (amount.lt(fund.amountWei) || expiration <= getDeadline(PERMIT_SIG_DEADLINE)) {
          details.push({
            token: fund.token.address,
            amount: MaxUint160.toHexString(),
            expiration: getDeadline(PERMIT_EXPIRATION),
            nonce,
          });
        }
      });
    }
    if (details.length === 0) return;

    let permit: PermitSingle | PermitBatch;
    const spender = core.calcAccountAgent(this.chainId, account);
    const sigDeadline = getDeadline(PERMIT_SIG_DEADLINE);
    if (details.length === 1) {
      permit = { details: details[0], spender, sigDeadline };
    } else {
      permit = { details: details, spender, sigDeadline };
    }

    return AllowanceTransfer.getPermitData(permit, getContractAddress(this.chainId, 'Permit2'), this.chainId);
  }

  async build(fields: PermitTokenLogicFields, options: PermitTokenLogicOptions) {
    const { permit, sig } = fields;
    const { account } = options;

    const to = getContractAddress(this.chainId, 'Permit2');
    let data: string;
    if (isPermitSingle(permit)) {
      data = Permit2__factory.createInterface().encodeFunctionData(
        'permit(address,((address,uint160,uint48,uint48),address,uint256),bytes)',
        [account, permit, sig]
      );
    } else {
      data = Permit2__factory.createInterface().encodeFunctionData(
        'permit(address,((address,uint160,uint48,uint48)[],address,uint256),bytes)',
        [account, permit, sig]
      );
    }

    return core.newLogic({ to, data });
  }
}
