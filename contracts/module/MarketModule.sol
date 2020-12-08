// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";

import "../module/ParameterModule.sol";

import "../Type.sol";

library MarketModule {
    using SignedSafeMathUpgradeable for int256;
    using ParameterModule for Market;
    using ParameterModule for Option;

    function initialize(
        Market storage market,
        address oracle,
        int256[8] calldata coreParams,
        int256[5] calldata riskParams,
        int256[5] calldata minRiskParamValues,
        int256[5] calldata maxRiskParamValues
    ) public {
        market.oracle = oracle;

        market.initialMarginRate = coreParams[0];
        market.maintenanceMarginRate = coreParams[1];
        market.operatorFeeRate = coreParams[2];
        market.lpFeeRate = coreParams[3];
        market.referrerRebateRate = coreParams[4];
        market.liquidationPenaltyRate = coreParams[5];
        market.keeperGasReward = coreParams[6];
        market.insuranceFundRate = coreParams[7];
        market.validateCoreParameters();

        market.spread.updateOption(riskParams[0], minRiskParamValues[0], maxRiskParamValues[0]);
        market.openSlippage.updateOption(
            riskParams[1],
            minRiskParamValues[1],
            maxRiskParamValues[1]
        );
        market.closeSlippage.updateOption(
            riskParams[2],
            minRiskParamValues[2],
            maxRiskParamValues[2]
        );
        market.fundingRateCoefficient.updateOption(
            riskParams[3],
            minRiskParamValues[3],
            maxRiskParamValues[3]
        );
        market.maxLeverage.updateOption(
            riskParams[4],
            minRiskParamValues[4],
            maxRiskParamValues[4]
        );
        market.validateRiskParameters();

        market.state = MarketState.NORMAL;
        market.id = marketID(oracle);
    }

    function marketID(address oracle) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(address(this), oracle));
    }

    function increaseDepositedCollateral(Market storage market, int256 amount) public {
        require(amount >= 0, "amount is negative");
        market.depositedCollateral = market.depositedCollateral.add(amount);
    }

    function decreaseDepositedCollateral(Market storage market, int256 amount) public {
        require(amount >= 0, "amount is negative");
        market.depositedCollateral = market.depositedCollateral.sub(amount);
        require(market.depositedCollateral >= 0, "collateral is negative");
    }
}