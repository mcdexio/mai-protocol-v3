// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import "../interface/IShareToken.sol";

import "../Type.sol";
import "../libraries/Constant.sol";
import "../libraries/Math.sol";
import "../libraries/SafeMathExt.sol";
import "../libraries/Utils.sol";
import "../module/MarginModule.sol";
import "../module/OracleModule.sol";

library AMMModule {
    using Math for int256;
    using Math for uint256;
    using SafeMathExt for int256;
    using SignedSafeMathUpgradeable for int256;
    using SafeMathUpgradeable for uint256;
    using OracleModule for Market;
    using MarginModule for Market;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;

    struct Context {
        int256 indexPrice;
        int256 IntermediateValue1;
        int256 IntermediateValue2;
        int256 IntermediateValue3;
        int256 availableCashBalance;
        int256 positionAmount;
    }

    function tradeWithAMM(
        Core storage core,
        bytes32 marketID,
        int256 tradingAmount,
        bool partialFill
    ) public view returns (int256 deltaMargin, int256 deltaPosition) {
        require(tradingAmount != 0, "trade amount is zero");
        Market storage market = core.markets[marketID];
        Context memory context = prepareContext(core, market);
        (int256 closingAmount, int256 openingAmount) = Utils.splitAmount(
            context.positionAmount,
            tradingAmount
        );
        deltaMargin = closePosition(market, context, closingAmount);
        context.availableCashBalance = context.availableCashBalance.add(deltaMargin);
        context.positionAmount = context.positionAmount.add(closingAmount);
        (int256 openDeltaMargin, int256 openDeltaPosition) = openPosition(
            market,
            context,
            openingAmount,
            partialFill
        );
        deltaMargin = deltaMargin.add(openDeltaMargin);
        deltaPosition = closingAmount.add(openDeltaPosition);
        int256 spread = market.spread.value.wmul(deltaMargin);
        deltaMargin = deltaMargin > 0 ? deltaMargin.add(spread) : deltaMargin.sub(spread);
    }

    function addLiquidity(
        Core storage core,
        bytes32 marketID,
        int256 cashToAdd
    ) public view returns (int256 shareAmount) {
        require(cashToAdd > 0, "margin to add must be positive");
        Market storage market = core.markets[marketID];
        Context memory context = prepareContext(core, market);
        int256 beta = market.openSlippage.value;
        int256 poolMargin;
        int256 newPoolMargin;
        if (isAMMMarginSafe(context, beta)) {
            poolMargin = regress(context, beta);
        } else {
            poolMargin = poolMarginBalance(core).div(2);
        }
        context.availableCashBalance = context.availableCashBalance.add(cashToAdd);
        if (isAMMMarginSafe(context, beta)) {
            newPoolMargin = regress(context, beta);
        } else {
            newPoolMargin = poolMarginBalance(core).add(cashToAdd).div(2);
        }
        int256 shareTotalSupply = IERC20Upgradeable(core.shareToken).totalSupply().toInt256();
        if (poolMargin == 0) {
            require(shareTotalSupply == 0, "share has no value");
            shareAmount = newPoolMargin;
        } else {
            shareAmount = newPoolMargin.sub(poolMargin).wdiv(poolMargin).wmul(shareTotalSupply);
        }
        require(shareAmount > 0, "share must be positive when add liquidity");
    }

    function removeLiquidity(
        Core storage core,
        bytes32 marketID,
        int256 shareToRemove
    ) public view returns (int256 marginToReturn) {
        require(shareToRemove > 0, "share amount must be positive");
        require(
            shareToRemove <= IERC20Upgradeable(core.shareToken).balanceOf(msg.sender).toInt256(),
            "insufficient share balance"
        );
        Market storage market = core.markets[marketID];
        Context memory context = prepareContext(core, market);
        int256 beta = market.openSlippage.value;
        require(isAMMMarginSafe(context, beta), "amm is unsafe before removing liquidity");

        int256 shareTotalSupply = IERC20Upgradeable(core.shareToken).totalSupply().toInt256();
        int256 shareRatio = shareTotalSupply.sub(shareToRemove).wdiv(shareTotalSupply);
        int256 poolMargin = regress(context, beta);
        poolMargin = poolMargin.wmul(shareRatio);
        if (context.positionAmount > 0) {
            int256 maxLongPosition = maxPosition(context, poolMargin, market.maxLeverage.value, beta, Side.LONG);
            require(
                context.positionAmount < maxLongPosition,
                "amm is unsafe after removing liquidity"
            );
        } else {
            int256 minShortPosition = maxPosition(context, poolMargin, market.maxLeverage.value, beta, Side.SHORT);
            require(
                context.positionAmount > minShortPosition,
                "amm is unsafe after removing liquidity"
            );
        }
        marginToReturn = marginToRemove(context, poolMargin, beta);
        require(marginToReturn >= 0, "margin to remove is negative");
    }

    function regress(Context memory context, int256 beta) public pure returns (int256 poolMargin) {
        int256 positionValue = context.indexPrice.wmul(context.positionAmount);
        int256 marginBalance = positionValue.add(context.IntermediateValue1);
        int256 tmp = positionValue.wmul(context.positionAmount).mul(beta).add(
            context.IntermediateValue2
        );
        int256 beforeSqrt = marginBalance.mul(marginBalance).sub(tmp.mul(2));
        require(beforeSqrt >= 0, "amm is unsafe when regress");
        poolMargin = beforeSqrt.sqrt().add(marginBalance).div(2);
    }

    function isAMMMarginSafe(Context memory context, int256 beta) public pure returns (bool) {
        int256 partialMarginBalance = context.availableCashBalance.add(context.IntermediateValue1);
        int256 tmp = context.IntermediateValue2;
        int256 betaPos = beta.wmul(context.positionAmount);
        if (context.positionAmount == 0) {
            return partialMarginBalance.mul(partialMarginBalance).sub(tmp.mul(2)) >= 0;
        }
        int256 beforeSqrt = partialMarginBalance.mul(2).neg().add(betaPos).mul(betaPos).add(
            tmp.mul(2)
        );
        if (context.positionAmount > 0 && beforeSqrt < 0) {
            return true;
        }
        require(beforeSqrt >= 0, "index bound is invalid");
        int256 bound = beforeSqrt.sqrt().add(betaPos).sub(partialMarginBalance).wdiv(
            context.positionAmount
        );
        return
            context.positionAmount > 0 ? context.indexPrice >= bound : context.indexPrice <= bound;
    }

    function poolCashBalance(Core storage core) internal view returns (int256 cashBalance) {
        uint256 marketCount = core.marketIDs.length();
        for (uint256 i = 0; i < marketCount; i++) {
            Market storage market = core.markets[core.marketIDs.at(i)];
            cashBalance = cashBalance.add(market.availableCashBalance(address(this)));
        }
        cashBalance = cashBalance.add(core.poolCashBalance);
    }

    function prepareContext(Core storage core, Market storage currentMarket)
        internal
        view
        returns (Context memory context)
    {
        uint256 marketCount = core.marketIDs.length();
        for (uint256 i = 0; i < marketCount; i++) {
            Market storage market = core.markets[core.marketIDs.at(i)];
            int256 positionAmount = market.positionAmount(address(this));
            int256 indexPrice = market.indexPrice();
            if (market.id == currentMarket.id) {
                context.indexPrice = indexPrice;
                context.positionAmount = positionAmount;
            } else {
                int256 positionValue = indexPrice.wmul(positionAmount);
                context.IntermediateValue1 = context.IntermediateValue1.add(positionValue);
                context.IntermediateValue2 = context.IntermediateValue2.add(
                    positionValue.wmul(positionAmount).mul(market.openSlippage.value)
                );
                context.IntermediateValue3 = context.IntermediateValue3.add(
                    positionValue.abs().wdiv(market.maxLeverage.value)
                );
            }
        }
        context.availableCashBalance = poolCashBalance(core);
        require(context.availableCashBalance.add(context.IntermediateValue1).add(
            context.indexPrice.wmul(context.positionAmount)
        ) >= 0, "amm is emergency");
    }

    function closePosition(
        Market storage market,
        Context memory context,
        int256 tradingAmount
    ) public view returns (int256 deltaMargin) {
        if (tradingAmount == 0) {
            return 0;
        }
        require(context.positionAmount != 0, "position is zero when close");
        int256 beta = market.closeSlippage.value;
        if (isAMMMarginSafe(context, beta)) {
            int256 poolMargin = regress(context, beta);
            int256 newPositionAmount = context.positionAmount.add(tradingAmount);
            if (newPositionAmount == 0) {
                return poolMargin.sub(context.availableCashBalance);
            } else {
                deltaMargin = _deltaMargin(
                    poolMargin,
                    context.positionAmount,
                    newPositionAmount,
                    context.indexPrice,
                    beta
                );
            }
        } else {
            deltaMargin = context.indexPrice.wmul(tradingAmount).neg();
        }
    }

    function openPosition(
        Market storage market,
        Context memory context,
        int256 tradingAmount,
        bool partialFill
    ) private view returns (int256 deltaMargin, int256 deltaPosition) {
        if (tradingAmount == 0) {
            return (0, 0);
        }
        int256 beta = market.openSlippage.value;
        if (!isAMMMarginSafe(context, beta)) {
            require(partialFill, "amm is unsafe when open");
            return (0, 0);
        }
        int256 newPosition = context.positionAmount.add(tradingAmount);
        require(newPosition != 0, "new position is zero when open");
        int256 poolMargin = regress(context, beta);
        if (newPosition > 0) {
            int256 maxLongPosition = maxPosition(context, poolMargin, market.maxLeverage.value, beta, Side.LONG);
            if (newPosition > maxLongPosition) {
                require(partialFill, "trade amount exceeds max amount");
                deltaPosition = maxLongPosition.sub(context.positionAmount);
                newPosition = maxLongPosition;
            } else {
                deltaPosition = tradingAmount;
            }
        } else {
            int256 minShortPosition = maxPosition(context, poolMargin, market.maxLeverage.value, beta, Side.SHORT);
            if (newPosition < minShortPosition) {
                require(partialFill, "trade amount exceeds max amount");
                deltaPosition = minShortPosition.sub(context.positionAmount);
                newPosition = minShortPosition;
            } else {
                deltaPosition = tradingAmount;
            }
        }
        deltaMargin = _deltaMargin(
            poolMargin,
            context.positionAmount,
            newPosition,
            context.indexPrice,
            beta
        );
    }

    function _deltaMargin(
        int256 poolMargin,
        int256 positionAmount1,
        int256 positionAmount2,
        int256 indexPrice,
        int256 beta
    ) internal pure returns (int256 deltaMargin) {
        deltaMargin = positionAmount2.add(positionAmount1).div(2).wmul(beta).wdiv(poolMargin).neg();
        deltaMargin = deltaMargin.add(Constant.SIGNED_ONE).wmul(indexPrice).wmul(
            positionAmount1.sub(positionAmount2)
        );
    }

    function maxPosition(
        Context memory context,
        int256 poolMargin,
        int256 maxLeverage,
        int256 beta,
        Side side
    ) internal pure returns (int256 maxPosition) {
        int256 beforeSqrt = poolMargin
            .mul(poolMargin)
            .mul(2)
            .sub(context.IntermediateValue2)
            .wdiv(context.indexPrice)
            .wdiv(beta);
        int256 maxPosition1 = beforeSqrt < 0 ? type(int256).max : beforeSqrt.sqrt();
        int256 maxPosition2;
        beforeSqrt = poolMargin.sub(context.IntermediateValue3).add(
            context.IntermediateValue2.wdiv(poolMargin).div(2)
        );
        beforeSqrt = beforeSqrt.wmul(maxLeverage).wmul(maxLeverage).wmul(beta);
        beforeSqrt = poolMargin.sub(
            beforeSqrt.mul(2).wdiv(context.indexPrice)
        );
        if (beforeSqrt < 0) {
            maxPosition2 = type(int256).max;
        } else {
            maxPosition2 = beforeSqrt.mul(poolMargin).sqrt();
            maxPosition2 = poolMargin.sub(maxPosition2).wdiv(maxLeverage).wdiv(beta);
        }
        maxPosition = maxPosition1 > maxPosition2 ? maxPosition2 : maxPosition1;
        if (side == Side.LONG) {
            int256 maxPosition3 = poolMargin.wdiv(beta);
            maxPosition = maxPosition > maxPosition3 ? maxPosition3 : maxPosition;
        } else {
            maxPosition = maxPosition.neg();
        }
    }

    function poolMarginBalance(Core storage core) private view returns (int256 marginBalance) {
        uint256 marketCount = core.marketIDs.length();
        for (uint256 i = 0; i < marketCount; i++) {
            Market storage market = core.markets[core.marketIDs.at(i)];
            marginBalance = marginBalance.add(market.margin(address(this)));
        }
        marginBalance = marginBalance.add(core.poolCashBalance);
    }

    function marginToRemove(
        Context memory context,
        int256 poolMargin,
        int256 beta
    ) public view returns (int256 removingMargin) {
        int256 positionValue = context.indexPrice.wmul(context.positionAmount);
        int256 tmpA = context.IntermediateValue1.add(positionValue);
        int256 tmpB = context.IntermediateValue2.add(
            positionValue.wmul(context.positionAmount).mul(beta)
        );
        removingMargin = tmpB.div(poolMargin).div(2).add(poolMargin).sub(tmpA);
        removingMargin = context.availableCashBalance.sub(removingMargin);
        require(removingMargin > 0, "removing margin must be positive");
    }
}