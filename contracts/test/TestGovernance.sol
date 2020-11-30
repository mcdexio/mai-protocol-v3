// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.7.4;
pragma experimental ABIEncoderV2;

import "../Governance.sol";

contract TestGovernance is Governance {
    function setGovernor(address governor) public {
        _governor = governor;
    }

    function setOperator(address operator) public {
        _core.operator = operator;
    }

    function initializeParameters(
        int256[7] calldata coreParams,
        int256[5] calldata riskParams,
        int256[5] calldata minRiskParamValues,
        int256[5] calldata maxRiskParamValues
    ) public {
        _initializeParameters(coreParams, riskParams, minRiskParamValues, maxRiskParamValues);
    }

    function initialMarginRate() public view returns (int256) {
        return _core.initialMarginRate;
    }

    function maintenanceMarginRate() public view returns (int256) {
        return _core.maintenanceMarginRate;
    }

    function operatorFeeRate() public view returns (int256) {
        return _core.operatorFeeRate;
    }

    function vaultFeeRate() public view returns (int256) {
        return _core.vaultFeeRate;
    }

    function lpFeeRate() public view returns (int256) {
        return _core.lpFeeRate;
    }

    function referrerRebateRate() public view returns (int256) {
        return _core.referrerRebateRate;
    }

    function liquidationPenaltyRate() public view returns (int256) {
        return _core.liquidationPenaltyRate;
    }

    function keeperGasReward() public view returns (int256) {
        return _core.keeperGasReward;
    }

    function halfSpreadRate() public view returns (int256) {
        return _core.halfSpreadRate.value;
    }

    function beta1() public view returns (int256) {
        return _core.beta1.value;
    }

    function beta2() public view returns (int256) {
        return _core.beta2.value;
    }

    function fundingRateCoefficient() public view returns (int256) {
        return _core.fundingRateCoefficient.value;
    }

    function targetLeverage() public view returns (int256) {
        return _core.targetLeverage.value;
    }
}
