// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "../Storage.sol";
import "../module/MarginModule.sol";
import "../module/ParameterModule.sol";
import "../Storage.sol";

contract TestMargin is Storage {
    using MarginModule for Core;
    using ParameterModule for Core;

    constructor(address oracle) {
        _core.oracle = oracle;
    }

    function updateMarkPrice(int256 price) external {
        _core.markPriceData.price = price;
    }

    function initializeMarginAccount(
        address trader,
        int256 cashBalance,
        int256 positionAmount,
        int256 entryFunding
    ) external {
        _core.marginAccounts[trader].cashBalance = cashBalance;
        _core.marginAccounts[trader].positionAmount = positionAmount;
        _core.marginAccounts[trader].entryFunding = entryFunding;
    }

    function updateUnitAccumulativeFunding(int256 newUnitAccumulativeFunding) external {
        _core.unitAccumulativeFunding = newUnitAccumulativeFunding;
    }

    function updateCoreParameter(bytes32 key, int256 newValue) external {
        _core.updateCoreParameter(key, newValue);
    }

    function initialMargin(address trader) external view returns (int256) {
        return _core.initialMargin(trader);
    }

    function maintenanceMargin(address trader) external view returns (int256) {
        return _core.maintenanceMargin(trader);
    }

    function availableCashBalance(address trader) external view returns (int256) {
        return _core.availableCashBalance(trader);
    }

    function positionAmount(address trader) external view returns (int256) {
        return _core.positionAmount(trader);
    }

    function isInitialMarginSafe(address trader) external view returns (bool) {
        return _core.isInitialMarginSafe(trader);
    }

    function isMaintenanceMarginSafe(address trader) external view returns (bool) {
        return _core.isMaintenanceMarginSafe(trader);
    }

    function isEmptyAccount(address trader) external view returns (bool) {
        return _core.isEmptyAccount(trader);
    }

    function updateMarginAccount(
        address trader,
        int256 deltaPositionAmount,
        int256 deltaMargin
    )
        external
        returns (
            int256 fundingLoss,
            int256 closingAmount,
            int256 openingAmount
        )
    {
        return _core.updateMarginAccount(trader, deltaPositionAmount, deltaMargin);
    }

    function closePosition(address trader, int256 amount) external {
        MarginAccount memory account = _core.marginAccounts[trader];
        MarginModule.closePosition(account, amount, _core.unitAccumulativeFunding);
        _core.marginAccounts[trader] = account;
    }

    function openPosition(address trader, int256 amount) external {
        MarginAccount memory account = _core.marginAccounts[trader];
        MarginModule.openPosition(account, amount, _core.unitAccumulativeFunding);
        _core.marginAccounts[trader] = account;
    }
}