// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;

import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";

import "../libraries/SafeMathExt.sol";
import "../libraries/Utils.sol";
import "../libraries/OrderData.sol";

import "../Type.sol";

library MarginAccountModule {
    using SafeMathExt for int256;
    using SafeCastUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using OrderData for uint32;

    /**
     * @dev Get the initial margin of the trader in the perpetual.
     *      Initial margin = price * abs(position) * initial margin rate
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     * @param price The price to calculate the initial margin
     * @return initialMargin The initial margin of the trader in the perpetual
     */
    function getInitialMargin(
        PerpetualStorage storage perpetual,
        address trader,
        int256 price
    ) internal view returns (int256 initialMargin) {
        initialMargin = perpetual
            .marginAccounts[trader]
            .position
            .wmul(price)
            .wmul(perpetual.initialMarginRate)
            .abs();
    }

    /**
     * @dev Get the maintenance margin of the trader in the perpetual.
     *      Maintenance margin = price * abs(position) * maintenance margin rate
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     * @param price The price to calculate the  maintenance margin
     * @return maintenanceMargin The maintenance margin of the trader in the perpetual
     */
    function getMaintenanceMargin(
        PerpetualStorage storage perpetual,
        address trader,
        int256 price
    ) internal view returns (int256 maintenanceMargin) {
        maintenanceMargin = perpetual
            .marginAccounts[trader]
            .position
            .wmul(price)
            .wmul(perpetual.maintenanceMarginRate)
            .abs();
    }

    /**
     * @dev Get the available cash of the trader in the perpetual.
     *      Available cash = cash - position * unit accumulative funding
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     * @return availableCash The available cash of the trader in the perpetual
     */
    function getAvailableCash(PerpetualStorage storage perpetual, address trader)
        internal
        view
        returns (int256 availableCash)
    {
        MarginAccount storage account = perpetual.marginAccounts[trader];
        availableCash = account.cash.sub(account.position.wmul(perpetual.unitAccumulativeFunding));
    }

    /**
     * @dev Get the position of the trader in the perpetual
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     * @return position The position of the trader in the perpetual
     */
    function getPosition(PerpetualStorage storage perpetual, address trader)
        internal
        view
        returns (int256 position)
    {
        position = perpetual.marginAccounts[trader].position;
    }

    /**
     * @dev Get the margin of the trader in the perpetual.
     *      Margin = available cash + position * price
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     * @param price The price to calculate the margin
     * @return margin The margin of the trader in the perpetual
     */
    function getMargin(
        PerpetualStorage storage perpetual,
        address trader,
        int256 price
    ) internal view returns (int256 margin) {
        margin = perpetual.marginAccounts[trader].position.wmul(price).add(
            getAvailableCash(perpetual, trader)
        );
    }

    /**
     * @dev Get the settleable margin of the trader in the perpetual.
     *      This is the margin trader can withdraw when the state of the perpetual is "CLEARED".
     *      If the state of the perpetual is not "CLEARED", the settleable margin is always zero
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     * @param price The price to calculate the settleable margin
     * @return margin The settleable margin of the trader in the perpetual
     */
    function getSettleableMargin(
        PerpetualStorage storage perpetual,
        address trader,
        int256 price
    ) internal view returns (int256 margin) {
        margin = getMargin(perpetual, trader, price);
        if (margin > 0) {
            int256 rate = (getPosition(perpetual, trader) == 0)
                ? perpetual.redemptionRateWithoutPosition
                : perpetual.redemptionRateWithPosition;
            // make sure total redemption margin < total collateral of perpetual
            margin = margin.wmul(rate, Round.FLOOR);
        } else {
            margin = 0;
        }
    }

    /**
     * @dev     Get the available margin of the trader in the perpetual.
     *          Available margin = margin - (initial margin + keeper gas reward), keeper gas reward = 0 if position = 0
     * @param   perpetual   The perpetual object
     * @param   trader      The address of the trader
     * @param   price       The price to calculate available margin
     * @return  availableMargin The available margin of the trader in the perpetual
     */
    function getAvailableMargin(
        PerpetualStorage storage perpetual,
        address trader,
        int256 price
    ) internal view returns (int256 availableMargin) {
        int256 threshold = getPosition(perpetual, trader) == 0
            ? 0
            : getInitialMargin(perpetual, trader, price).add(perpetual.keeperGasReward);
        availableMargin = getMargin(perpetual, trader, price).sub(threshold);
    }

    /**
     * @dev     Check if the trader is initial margin safe in the perpetual, which means available margin >= 0
     * @param   perpetual   The perpetual object
     * @param   trader      The address of the trader
     * @param   price       The price to calculate the available margin
     * @return  isSafe      True if the trader is initial margin safe in the perpetual
     */
    function isInitialMarginSafe(
        PerpetualStorage storage perpetual,
        address trader,
        int256 price
    ) internal view returns (bool isSafe) {
        isSafe = (getAvailableMargin(perpetual, trader, price) >= 0);
    }

    /**
     * @dev Check if the trader is maintenance margin safe in the perpetual, which means
     *      margin >= maintenance margin + keeper gas reward. Keeper gas reward = 0 if position = 0
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     * @param price The price to calculate the maintenance margin
     * @return isSafe True if the trader is maintenance margin safe in the perpetual
     */
    function isMaintenanceMarginSafe(
        PerpetualStorage storage perpetual,
        address trader,
        int256 price
    ) internal view returns (bool isSafe) {
        int256 threshold = getPosition(perpetual, trader) == 0
            ? 0
            : getMaintenanceMargin(perpetual, trader, price).add(perpetual.keeperGasReward);
        isSafe = getMargin(perpetual, trader, price) >= threshold;
    }

    /**
     * @dev Check if the trader is margin safe in the perpetual, which means margin >= keeper gas reward.
     *      Keeper gas reward = 0 if position = 0
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     * @param price The price to calculate the margin
     * @return isSafe True if the trader is margin safe in the perpetual
     */
    function isMarginSafe(
        PerpetualStorage storage perpetual,
        address trader,
        int256 price
    ) internal view returns (bool isSafe) {
        int256 threshold = getPosition(perpetual, trader) == 0 ? 0 : perpetual.keeperGasReward;
        isSafe = getMargin(perpetual, trader, price) >= threshold;
    }

    /**
     * @dev Check if the account of the trader is empty in the perpetual, which means cash = 0 and position = 0
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     * @return isEmpty True if the account of the trader is empty in the perpetual
     */
    function isEmptyAccount(PerpetualStorage storage perpetual, address trader)
        internal
        view
        returns (bool isEmpty)
    {
        MarginAccount storage account = perpetual.marginAccounts[trader];
        isEmpty = (account.cash == 0 && account.position == 0);
    }

    /**
     * @dev Update the trader's cash in the perpetual
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     * @param deltaCash The update cash(collateral) of the trader's account in the perpetual
     */
    function updateCash(
        PerpetualStorage storage perpetual,
        address trader,
        int256 deltaCash
    ) internal {
        if (deltaCash == 0) {
            return;
        }
        MarginAccount storage account = perpetual.marginAccounts[trader];
        account.cash = account.cash.add(deltaCash);
    }

    /**
     * @dev Update the trader's account in the perpetual
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     * @param deltaPosition The update position of the trader's account in the perpetual
     * @param deltaCash The update cash(collateral) of the trader's account in the perpetual
     */
    function updateMargin(
        PerpetualStorage storage perpetual,
        address trader,
        int256 deltaPosition,
        int256 deltaCash
    ) internal returns (int256 deltaOpenInterest) {
        MarginAccount storage account = perpetual.marginAccounts[trader];
        int256 oldPosition = account.position;
        account.position = account.position.add(deltaPosition);
        account.cash = account.cash.add(deltaCash).add(
            perpetual.unitAccumulativeFunding.wmul(deltaPosition)
        );
        if (oldPosition > 0) {
            deltaOpenInterest = oldPosition.neg();
        }
        if (account.position > 0) {
            deltaOpenInterest = deltaOpenInterest.add(account.position);
        }
        perpetual.openInterest = perpetual.openInterest.add(deltaOpenInterest);
    }

    /**
     * @dev Reset the trader's account in the perpetual to empty, which means position = 0 and cash = 0
     * @param perpetual The perpetual object
     * @param trader The address of the trader
     */
    function resetAccount(PerpetualStorage storage perpetual, address trader) internal {
        MarginAccount storage account = perpetual.marginAccounts[trader];
        account.cash = 0;
        account.position = 0;
    }

    // deprecated
    function setTargetLeverage(
        PerpetualStorage storage perpetual,
        address trader,
        int256 targetLeverage
    ) internal {
        perpetual.marginAccounts[trader].targetLeverage = targetLeverage;
    }

    function getTargetLeverage(PerpetualStorage storage perpetual, address trader)
        internal
        view
        returns (int256)
    {
        require(perpetual.initialMarginRate != 0, "initialMarginRate is not set");
        int256 maxLeverage = Constant.SIGNED_ONE.wdiv(perpetual.initialMarginRate);
        int256 targetLeverage = perpetual.marginAccounts[trader].targetLeverage;
        targetLeverage = targetLeverage == 0
            ? perpetual.defaultTargetLeverage.value
            : targetLeverage;
        return targetLeverage.min(maxLeverage);
    }

    function getTargetLeverageWithFlags(
        PerpetualStorage storage perpetual,
        address trader,
        uint32 flags
    ) internal view returns (int256 targetLeverage) {
        require(perpetual.initialMarginRate != 0, "initialMarginRate is not set");
        int256 maxLeverage = Constant.SIGNED_ONE.wdiv(perpetual.initialMarginRate);
        bool _oldUseTargetLeverage = flags.oldUseTargetLeverage();
        bool _newUseTargetLeverage = flags.newUseTargetLeverage();
        require(!(_oldUseTargetLeverage && _newUseTargetLeverage), "invalid flags");
        if (_oldUseTargetLeverage) {
            targetLeverage = perpetual.marginAccounts[trader].targetLeverage;
        } else {
            targetLeverage = flags.getTargetLeverageByFlags();
        }
        targetLeverage = targetLeverage == 0
            ? perpetual.defaultTargetLeverage.value
            : targetLeverage;
        targetLeverage = targetLeverage.min(maxLeverage);
    }
}
