// SPDX-License-Identifier: BUSL-1.1
pragma solidity >=0.7.4;
pragma experimental ABIEncoderV2;

import "../module/PerpetualModule.sol";
import "../module/LiquidityPoolModule.sol";
import "../module/CollateralModule.sol";

import "../Governance.sol";

contract TestGovernance is Governance {
    using CollateralModule for LiquidityPoolStorage;
    using PerpetualModule for PerpetualStorage;
    using LiquidityPoolModule for LiquidityPoolStorage;

    function setCreator(address creator) public {
        _liquidityPool.creator = creator;
    }

    function setGovernor(address governor) public {
        _liquidityPool.governor = governor;
    }

    function setCollateralToken(address collateralToken, uint256 collateralDecimals) public {
        _liquidityPool.initializeCollateral(collateralToken, collateralDecimals);
    }

    function setTotalCollateral(uint256 perpetualIndex, int256 amount) public {
        _liquidityPool.perpetuals[perpetualIndex].totalCollateral = amount;
    }

    function setOperatorNoAuth(address operator) public {
        _liquidityPool.operator = operator;
        _liquidityPool.operatorExpiration = block.timestamp + 86400;
    }

    function initializeParameters(
        address oracle,
        int256[9] calldata baseParams,
        int256[8] calldata riskParams,
        int256[8] calldata minRiskParamValues,
        int256[8] calldata maxRiskParamValues
    ) public {
        _liquidityPool.perpetuals[_liquidityPool.perpetualCount].initialize(
            _liquidityPool.perpetualCount,
            oracle,
            baseParams,
            riskParams,
            minRiskParamValues,
            maxRiskParamValues
        );
        _liquidityPool.perpetuals[_liquidityPool.perpetualCount].state = PerpetualState.NORMAL;
        _liquidityPool.perpetualCount++;
    }

    function isFastCreationEnabled() public view returns (bool) {
        return _liquidityPool.isFastCreationEnabled;
    }

    function initialMarginRate(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].initialMarginRate;
    }

    function maintenanceMarginRate(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].maintenanceMarginRate;
    }

    function operatorFeeRate(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].operatorFeeRate;
    }

    function lpFeeRate(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].lpFeeRate;
    }

    function referralRebateRate(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].referralRebateRate;
    }

    function liquidationPenaltyRate(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].liquidationPenaltyRate;
    }

    function keeperGasReward(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].keeperGasReward;
    }

    function insuranceFundRate(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].insuranceFundRate;
    }

    function halfSpread(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].halfSpread.value;
    }

    function openSlippageFactor(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].openSlippageFactor.value;
    }

    function closeSlippageFactor(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].closeSlippageFactor.value;
    }

    function fundingRateLimit(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].fundingRateLimit.value;
    }

    function fundingRateFactor(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].fundingRateFactor.value;
    }

    function ammMaxLeverage(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].ammMaxLeverage.value;
    }

    function maxClosePriceDiscount(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].maxClosePriceDiscount.value;
    }

    function state(uint256 perpetualIndex) public view returns (PerpetualState) {
        return _liquidityPool.perpetuals[perpetualIndex].state;
    }

    function setState(uint256 perpetualIndex, PerpetualState _state) public {
        _liquidityPool.perpetuals[perpetualIndex].state = _state;
    }

    function operatorExpiration() public view returns (uint256) {
        return _liquidityPool.operatorExpiration;
    }

    function setOperatorExpiration(uint256 timestamp) public {
        _liquidityPool.operatorExpiration = timestamp;
    }

    function getOperator() public view returns (address) {
        return _liquidityPool.getOperator();
    }

    function settlementPrice(uint256 perpetualIndex) public view returns (int256, uint256) {
        OraclePriceData storage priceData = _liquidityPool
            .perpetuals[perpetualIndex]
            .settlementPriceData;
        return (priceData.price, priceData.time);
    }

    function setMarginAccount(
        uint256 perpetualIndex,
        address trader,
        int256 cash,
        int256 position
    ) external {
        PerpetualStorage storage perpetual = _liquidityPool.perpetuals[perpetualIndex];
        perpetual.marginAccounts[trader].cash = cash;
        perpetual.marginAccounts[trader].position = position;
    }

    function setPoolCash(int256 poolCash) external {
        _liquidityPool.poolCash = poolCash;
    }

    function getMarginAccount(uint256 perpetualIndex, address trader)
        external
        view
        returns (int256 cash, int256 position)
    {
        PerpetualStorage storage perpetual = _liquidityPool.perpetuals[perpetualIndex];
        cash = perpetual.marginAccounts[trader].cash;
        position = perpetual.marginAccounts[trader].position;
    }

    function getPoolCash() external view returns (int256 poolCash) {
        poolCash = _liquidityPool.poolCash;
    }

    function oracle(uint256 perpetualIndex) public view returns (address) {
        return _liquidityPool.perpetuals[perpetualIndex].oracle;
    }

    function donateInsuranceFund(int256 amount) public {
        _liquidityPool.donateInsuranceFund(msg.sender, amount);
    }
}
