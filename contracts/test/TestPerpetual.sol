// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import "../module/AMMModule.sol";
import "../module/PerpetualModule.sol";
import "../module/MarginAccountModule.sol";

import "../Perpetual.sol";
import "../Storage.sol";
import "../Type.sol";

contract TestPerpetual is Storage {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using AMMModule for LiquidityPoolStorage;
    using PerpetualModule for PerpetualStorage;
    using PerpetualModule for Option;
    using MarginAccountModule for PerpetualStorage;

    // ================ debug ============================================
    function createPerpetual(
        address oracle,
        int256[9] calldata baseParams,
        int256[9] calldata riskParams
    ) external {
        uint256 perpetualIndex = _liquidityPool.perpetualCount;
        PerpetualStorage storage perpetual = _liquidityPool.perpetuals[perpetualIndex];
        perpetual.initialize(
            perpetualIndex,
            oracle,
            baseParams,
            riskParams,
            riskParams,
            riskParams
        );
        _liquidityPool.perpetualCount++;
    }

    function setPerpetualBaseParameter(
        uint256 perpetualIndex,
        bytes32 key,
        int256 newValue
    ) public {
        PerpetualStorage storage perpetual = _liquidityPool.perpetuals[perpetualIndex];

        if (key == "initialMarginRate") {
            require(
                newValue < perpetual.initialMarginRate,
                "increasing initial margin rate is not allowed"
            );
            perpetual.initialMarginRate = newValue;
        } else if (key == "maintenanceMarginRate") {
            require(
                newValue < perpetual.maintenanceMarginRate,
                "increasing maintenance margin rate is not allowed"
            );
            perpetual.maintenanceMarginRate = newValue;
        } else if (key == "operatorFeeRate") {
            perpetual.operatorFeeRate = newValue;
        } else if (key == "lpFeeRate") {
            perpetual.lpFeeRate = newValue;
        } else if (key == "liquidationPenaltyRate") {
            perpetual.liquidationPenaltyRate = newValue;
        } else if (key == "keeperGasReward") {
            perpetual.keeperGasReward = newValue;
        } else if (key == "referralRebateRate") {
            perpetual.referralRebateRate = newValue;
        } else if (key == "insuranceFundRate") {
            perpetual.insuranceFundRate = newValue;
        } else {
            revert("key not found");
        }
    }

    function setPerpetualRiskParameter(
        uint256 perpetualIndex,
        bytes32 key,
        int256 newValue,
        int256 newMinValue,
        int256 newMaxValue
    ) public {
        PerpetualStorage storage perpetual = _liquidityPool.perpetuals[perpetualIndex];
        if (key == "halfSpread") {
            perpetual.halfSpread.setOption(newValue, newMinValue, newMaxValue);
        } else if (key == "openSlippageFactor") {
            perpetual.openSlippageFactor.setOption(newValue, newMinValue, newMaxValue);
        } else if (key == "closeSlippageFactor") {
            perpetual.closeSlippageFactor.setOption(newValue, newMinValue, newMaxValue);
        } else if (key == "fundingRateLimit") {
            perpetual.fundingRateLimit.setOption(newValue, newMinValue, newMaxValue);
        } else if (key == "ammMaxLeverage") {
            perpetual.ammMaxLeverage.setOption(newValue, newMinValue, newMaxValue);
        } else if (key == "maxClosePriceDiscount") {
            perpetual.maxClosePriceDiscount.setOption(newValue, newMinValue, newMaxValue);
        } else if (key == "fundingRateFactor") {
            perpetual.fundingRateFactor.setOption(newValue, newMinValue, newMaxValue);
        } else {
            revert("key not found");
        }
    }

    function updatePerpetualRiskParameter(
        uint256 perpetualIndex,
        bytes32 key,
        int256 newValue
    ) public {
        PerpetualStorage storage perpetual = _liquidityPool.perpetuals[perpetualIndex];
        if (key == "halfSpread") {
            perpetual.halfSpread.updateOption(newValue);
        } else if (key == "openSlippageFactor") {
            perpetual.openSlippageFactor.updateOption(newValue);
        } else if (key == "closeSlippageFactor") {
            perpetual.closeSlippageFactor.updateOption(newValue);
        } else if (key == "fundingRateLimit") {
            perpetual.fundingRateLimit.updateOption(newValue);
        } else if (key == "ammMaxLeverage") {
            perpetual.ammMaxLeverage.updateOption(newValue);
        } else if (key == "maxClosePriceDiscount") {
            perpetual.maxClosePriceDiscount.updateOption(newValue);
        } else if (key == "fundingRateFactor") {
            perpetual.fundingRateFactor.updateOption(newValue);
        } else {
            revert("key not found");
        }
    }

    function setInsuranceFundCap(int256 insuranceFundCap) public {
        _liquidityPool.insuranceFundCap = insuranceFundCap;
    }

    function setState(uint256 perpetualIndex, PerpetualState state) public {
        _liquidityPool.perpetuals[perpetualIndex].state = state;
    }

    function getState(uint256 perpetualIndex) public view returns (PerpetualState) {
        return _liquidityPool.perpetuals[perpetualIndex].state;
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

    function isTraderRegistered(uint256 perpetualIndex, address trader)
        public
        view
        returns (bool isRegistered)
    {
        isRegistered = _liquidityPool.perpetuals[perpetualIndex].activeAccounts.contains(trader);
    }

    function getActiveUserCount(uint256 perpetualIndex) public view returns (uint256 count) {
        count = _liquidityPool.perpetuals[perpetualIndex].activeAccounts.length();
    }

    function getMarginAccount(uint256 perpetualIndex, address trader)
        public
        view
        returns (int256 cash, int256 position)
    {
        MarginAccount storage account = _liquidityPool.perpetuals[perpetualIndex].marginAccounts[
            trader
        ];
        cash = account.cash;
        position = account.position;
    }

    function getUnitAccumulativeFunding(uint256 perpetualIndex)
        public
        view
        returns (int256 unitAccumulativeFunding)
    {
        unitAccumulativeFunding = _liquidityPool.perpetuals[perpetualIndex].unitAccumulativeFunding;
    }

    function setUnitAccumulativeFunding(uint256 perpetualIndex, int256 unitAccumulativeFunding)
        public
    {
        _liquidityPool.perpetuals[perpetualIndex].unitAccumulativeFunding = unitAccumulativeFunding;
    }

    function getFundingRate(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].fundingRate;
    }

    function setFundingRate(uint256 perpetualIndex, int256 fundingRate) public {
        _liquidityPool.perpetuals[perpetualIndex].fundingRate = fundingRate;
    }

    function getTotalCollateral(uint256 perpetualIndex) public view returns (int256) {
        PerpetualStorage storage perpetual = _liquidityPool.perpetuals[perpetualIndex];
        return perpetual.totalCollateral;
    }

    function setTotalCollateral(uint256 perpetualIndex, int256 amount) public {
        PerpetualStorage storage perpetual = _liquidityPool.perpetuals[perpetualIndex];
        perpetual.totalCollateral = amount;
    }

    function getRedemptionRateWithoutPosition(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].redemptionRateWithoutPosition;
    }

    function getRedemptionRateWithPosition(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].redemptionRateWithPosition;
    }

    function getTotalMarginWithPosition(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].totalMarginWithPosition;
    }

    function getTotalMarginWithoutPosition(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].totalMarginWithoutPosition;
    }

    // raw interface
    function getMarkPrice(uint256 perpetualIndex) public view returns (int256 price) {
        price = _liquidityPool.perpetuals[perpetualIndex].getMarkPrice();
    }

    function getIndexPrice(uint256 perpetualIndex) public view returns (int256 price) {
        price = _liquidityPool.perpetuals[perpetualIndex].getIndexPrice();
    }

    function getRebalanceMargin(uint256 perpetualIndex)
        public
        view
        returns (int256 marginToRebalance)
    {
        marginToRebalance = _liquidityPool.perpetuals[perpetualIndex].getRebalanceMargin();
    }

    function updateFundingState(uint256 perpetualIndex, int256 timeElapsed) public {
        _liquidityPool.perpetuals[perpetualIndex].updateFundingState(timeElapsed);
    }

    function updateFundingRate(uint256 perpetualIndex, int256 poolMargin) public {
        _liquidityPool.perpetuals[perpetualIndex].updateFundingRate(poolMargin);
    }

    function setNormalState(uint256 perpetualIndex) public {
        _liquidityPool.perpetuals[perpetualIndex].setNormalState();
    }

    function setEmergencyState(uint256 perpetualIndex) public virtual {
        _liquidityPool.perpetuals[perpetualIndex].setEmergencyState();
    }

    function setClearedState(uint256 perpetualIndex) public {
        _liquidityPool.perpetuals[perpetualIndex].setClearedState();
    }

    function deposit(
        uint256 perpetualIndex,
        address trader,
        int256 amount
    ) public returns (bool isInitialDeposit) {
        isInitialDeposit = _liquidityPool.perpetuals[perpetualIndex].deposit(trader, amount);
    }

    function withdraw(
        uint256 perpetualIndex,
        address trader,
        int256 amount
    ) public returns (bool isLastWithdrawal) {
        isLastWithdrawal = _liquidityPool.perpetuals[perpetualIndex].withdraw(trader, amount);
    }

    function clear(uint256 perpetualIndex, address trader) public returns (bool isAllCleared) {
        isAllCleared = _liquidityPool.perpetuals[perpetualIndex].clear(trader);
    }

    function settle(uint256 perpetualIndex, address trader) public returns (int256 marginToReturn) {
        marginToReturn = _liquidityPool.perpetuals[perpetualIndex].settle(trader);
    }

    function getNextActiveAccount(uint256 perpetualIndex) public view returns (address account) {
        account = _liquidityPool.perpetuals[perpetualIndex].getNextActiveAccount();
    }

    function getSettleableMargin(uint256 perpetualIndex, address trader)
        public
        view
        returns (int256 margin)
    {
        PerpetualStorage storage perpetual = _liquidityPool.perpetuals[perpetualIndex];
        margin = perpetual.getSettleableMargin(trader, perpetual.getMarkPrice());
    }

    function registerActiveAccount(uint256 perpetualIndex, address trader) public {
        _liquidityPool.perpetuals[perpetualIndex].registerActiveAccount(trader);
    }

    function deregisterActiveAccount(uint256 perpetualIndex, address trader) public {
        _liquidityPool.perpetuals[perpetualIndex].registerActiveAccount(trader);
    }

    function settleCollateral(uint256 perpetualIndex) public {
        _liquidityPool.perpetuals[perpetualIndex].settleCollateral();
    }

    // prettier-ignore
    function updatePrice(uint256 perpetualIndex) public virtual {
          _liquidityPool.perpetuals[perpetualIndex].updatePrice();
    }

    function increaseTotalCollateral(uint256 perpetualIndex, int256 amount) public {
        _liquidityPool.perpetuals[perpetualIndex].increaseTotalCollateral(amount);
    }

    function decreaseTotalCollateral(uint256 perpetualIndex, int256 amount) public {
        _liquidityPool.perpetuals[perpetualIndex].decreaseTotalCollateral(amount);
    }

    function getOpenInterest(uint256 perpetualIndex) public view returns (int256) {
        return _liquidityPool.perpetuals[perpetualIndex].openInterest;
    }

    function setOpenInterest(uint256 perpetualIndex, int256 value) public {
        _liquidityPool.perpetuals[perpetualIndex].openInterest = value;
    }
}
