// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";

import "../interface/IAccessControl.sol";
import "../interface/IGovernor.sol";
import "../interface/IPoolCreatorFull.sol";
import "../interface/ISymbolService.sol";

import "../libraries/SafeMathExt.sol";
import "../libraries/OrderData.sol";
import "../libraries/Utils.sol";

import "./AMMModule.sol";
import "./CollateralModule.sol";
import "./MarginAccountModule.sol";
import "./PerpetualModule.sol";
import "./LiquidityPoolModule.sol";
import "./LiquidityPoolModule2.sol";

import "../Type.sol";

library LiquidityPoolModule2 {
    using SafeCastUpgradeable for uint256;
    using SafeCastUpgradeable for int256;
    using SafeMathExt for int256;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    using OrderData for uint32;
    using AMMModule for LiquidityPoolStorage;
    using CollateralModule for LiquidityPoolStorage;
    using LiquidityPoolModule for LiquidityPoolStorage;
    using LiquidityPoolModule2 for LiquidityPoolStorage;
    using MarginAccountModule for PerpetualStorage;
    using PerpetualModule for PerpetualStorage;

    uint256 public constant MAX_PERPETUAL_COUNT = 48;

    event SetLiquidityPoolParameter(int256[4] value);
    event CreatePerpetual(
        uint256 perpetualIndex,
        address governor,
        address shareToken,
        address operator,
        address oracle,
        address collateral,
        int256[9] baseParams,
        int256[8] riskParams
    );
    event RunLiquidityPool();
    event AddAMMKeeper(uint256 perpetualIndex, address indexed keeper);
    event RemoveAMMKeeper(uint256 perpetualIndex, address indexed keeper);
    event AddTraderKeeper(uint256 perpetualIndex, address indexed keeper);
    event RemoveTraderKeeper(uint256 perpetualIndex, address indexed keeper);

    /**
     * @dev     Create and initialize new perpetual in the liquidity pool. Can only called by the operator
     *          if the liquidity pool is running or isFastCreationEnabled is set to true.
     *          Otherwise can only called by the governor
     * @param   liquidityPool       The reference of liquidity pool storage.
     * @param   oracle              The oracle's address of the perpetual
     * @param   baseParams          The base parameters of the perpetual
     * @param   riskParams          The risk parameters of the perpetual, must between minimum value and maximum value
     * @param   minRiskParamValues  The risk parameters' minimum values of the perpetual
     * @param   maxRiskParamValues  The risk parameters' maximum values of the perpetual
     */
    function createPerpetual(
        LiquidityPoolStorage storage liquidityPool,
        address oracle,
        int256[9] calldata baseParams,
        int256[8] calldata riskParams,
        int256[8] calldata minRiskParamValues,
        int256[8] calldata maxRiskParamValues
    ) public {
        require(
            liquidityPool.perpetualCount < MAX_PERPETUAL_COUNT,
            "perpetual count exceeds limit"
        );
        uint256 perpetualIndex = liquidityPool.perpetualCount;
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[perpetualIndex];
        perpetual.initialize(
            perpetualIndex,
            oracle,
            baseParams,
            riskParams,
            minRiskParamValues,
            maxRiskParamValues
        );
        ISymbolService service = ISymbolService(
            IPoolCreatorFull(liquidityPool.creator).getSymbolService()
        );
        service.allocateSymbol(address(this), perpetualIndex);
        if (liquidityPool.isRunning) {
            perpetual.setNormalState();
        }
        liquidityPool.perpetualCount++;

        emit CreatePerpetual(
            perpetualIndex,
            liquidityPool.governor,
            liquidityPool.shareToken,
            liquidityPool.getOperator(),
            oracle,
            liquidityPool.collateralToken,
            baseParams,
            riskParams
        );
    }

    /**
     * @dev     Update the oracle price of each perpetual of the liquidity pool.
     *          If oracle is terminated, set market to EMERGENCY.
     *
     * @param   liquidityPool       The liquidity pool object
     * @param   ignoreTerminated    Ignore terminated oracle if set to True.
     */
    function updatePrice(LiquidityPoolStorage storage liquidityPool, bool ignoreTerminated) public {
        uint256 length = liquidityPool.perpetualCount;
        for (uint256 i = 0; i < length; i++) {
            PerpetualStorage storage perpetual = liquidityPool.perpetuals[i];
            if (perpetual.state != PerpetualState.NORMAL) {
                continue;
            }
            perpetual.updatePrice();
            if (IOracle(perpetual.oracle).isTerminated() && !ignoreTerminated) {
                setEmergencyState(liquidityPool, perpetual.id);
            }
        }
    }

    /**
     * @dev     Run the liquidity pool. Can only called by the operator. The operator can create new perpetual before running
     *          or after running if isFastCreationEnabled is set to true
     *
     * @param   liquidityPool   The reference of liquidity pool storage.
     */
    function runLiquidityPool(LiquidityPoolStorage storage liquidityPool) public {
        uint256 length = liquidityPool.perpetualCount;
        require(length > 0, "there should be at least 1 perpetual to run");
        for (uint256 i = 0; i < length; i++) {
            liquidityPool.perpetuals[i].setNormalState();
        }
        liquidityPool.isRunning = true;
        emit RunLiquidityPool();
    }

    /**
     * @dev     Set the parameter of the liquidity pool. Can only called by the governor.
     *
     * @param   liquidityPool  The reference of liquidity pool storage.
     * @param   params         The new value of the parameter
     */
    function setLiquidityPoolParameter(
        LiquidityPoolStorage storage liquidityPool,
        int256[4] memory params
    ) public {
        validateLiquidityPoolParameter(params);
        liquidityPool.isFastCreationEnabled = (params[0] != 0);
        liquidityPool.insuranceFundCap = params[1];
        liquidityPool.liquidityCap = uint256(params[2]);
        liquidityPool.shareTransferDelay = uint256(params[3]);
        emit SetLiquidityPoolParameter(params);
    }

    /**
     * @dev     Validate the liquidity pool parameter:
     *            1. insurance fund cap >= 0
     * @param   liquidityPoolParams  The parameters of the liquidity pool.
     */
    function validateLiquidityPoolParameter(int256[4] memory liquidityPoolParams) public pure {
        require(liquidityPoolParams[1] >= 0, "insuranceFundCap < 0");
        require(liquidityPoolParams[2] >= 0, "liquidityCap < 0");
        require(liquidityPoolParams[3] >= 1, "shareTransferDelay < 1");
    }

    /**
     * @dev     Add an account to the whitelist, accounts in the whitelist is allowed to call `liquidateByAMM`.
     *          If never called, the whitelist in poolCreator will be used instead.
     *          Once called, the local whitelist will be used and the the whitelist in poolCreator will be ignored.
     *
     * @param   keeper          The account of keeper.
     * @param   perpetualIndex  The index of perpetual in the liquidity pool
     */
    function addAMMKeeper(
        LiquidityPoolStorage storage liquidityPool,
        uint256 perpetualIndex,
        address keeper
    ) public {
        require(perpetualIndex < liquidityPool.perpetualCount, "perpetual index out of range");
        EnumerableSetUpgradeable.AddressSet storage whitelist = liquidityPool
            .perpetuals[perpetualIndex]
            .ammKeepers;
        require(!whitelist.contains(keeper), "keeper is already added");
        bool success = whitelist.add(keeper);
        require(success, "fail to add keeper to whitelist");
        emit AddAMMKeeper(perpetualIndex, keeper);
    }

    /**
     * @dev     Remove an account from the `liquidateByAMM` whitelist.
     *
     * @param   keeper          The account of keeper.
     * @param   perpetualIndex  The index of perpetual in the liquidity pool
     */
    function removeAMMKeeper(
        LiquidityPoolStorage storage liquidityPool,
        uint256 perpetualIndex,
        address keeper
    ) public {
        require(perpetualIndex < liquidityPool.perpetualCount, "perpetual index out of range");
        EnumerableSetUpgradeable.AddressSet storage whitelist = liquidityPool
            .perpetuals[perpetualIndex]
            .ammKeepers;
        require(whitelist.contains(keeper), "keeper is not added");
        bool success = whitelist.remove(keeper);
        require(success, "fail to remove keeper from whitelist");
        emit RemoveAMMKeeper(perpetualIndex, keeper);
    }

    function setPerpetualOracle(
        LiquidityPoolStorage storage liquidityPool,
        uint256 perpetualIndex,
        address newOracle
    ) public {
        require(perpetualIndex < liquidityPool.perpetualCount, "perpetual index out of range");
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[perpetualIndex];
        perpetual.setOracle(newOracle);
    }

    /**
     * @dev     Set the base parameter of the perpetual. Can only called by the governor
     * @param   liquidityPool   The reference of liquidity pool storage.
     * @param   perpetualIndex  The index of perpetual in the liquidity pool
     * @param   baseParams      The new value of the base parameter
     */
    function setPerpetualBaseParameter(
        LiquidityPoolStorage storage liquidityPool,
        uint256 perpetualIndex,
        int256[9] memory baseParams
    ) public {
        require(perpetualIndex < liquidityPool.perpetualCount, "perpetual index out of range");
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[perpetualIndex];
        perpetual.setBaseParameter(baseParams);
    }

    /**
     * @dev     Set the risk parameter of the perpetual, including minimum value and maximum value.
     *          Can only called by the governor
     * @param   liquidityPool       The reference of liquidity pool storage.
     * @param   perpetualIndex      The index of perpetual in the liquidity pool
     * @param   riskParams          The new value of the risk parameter, must between minimum value and maximum value
     * @param   minRiskParamValues  The minimum value of the risk parameter
     * @param   maxRiskParamValues  The maximum value of the risk parameter
     */
    function setPerpetualRiskParameter(
        LiquidityPoolStorage storage liquidityPool,
        uint256 perpetualIndex,
        int256[8] memory riskParams,
        int256[8] memory minRiskParamValues,
        int256[8] memory maxRiskParamValues
    ) public {
        require(perpetualIndex < liquidityPool.perpetualCount, "perpetual index out of range");
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[perpetualIndex];
        perpetual.setRiskParameter(riskParams, minRiskParamValues, maxRiskParamValues);
    }

    /**
     * @dev     Set the risk parameter of the perpetual. Can only called by the governor
     * @param   liquidityPool   The reference of liquidity pool storage.
     * @param   perpetualIndex  The index of perpetual in the liquidity pool
     * @param   riskParams      The new value of the risk parameter, must between minimum value and maximum value
     */
    function updatePerpetualRiskParameter(
        LiquidityPoolStorage storage liquidityPool,
        uint256 perpetualIndex,
        int256[8] memory riskParams
    ) public {
        require(perpetualIndex < liquidityPool.perpetualCount, "perpetual index out of range");
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[perpetualIndex];
        perpetual.updateRiskParameter(riskParams);
    }

    /**
     * @dev     Set the state of the perpetual to "EMERGENCY". Must rebalance first.
     *          After that the perpetual is not allowed to trade, deposit and withdraw.
     *          The price of the perpetual is freezed to the settlement price
     * @param   liquidityPool   The reference of liquidity pool storage.
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool
     */
    function setEmergencyState(LiquidityPoolStorage storage liquidityPool, uint256 perpetualIndex)
        public
    {
        require(perpetualIndex < liquidityPool.perpetualCount, "perpetual index out of range");
        LiquidityPoolModule.rebalance(liquidityPool, perpetualIndex);
        liquidityPool.perpetuals[perpetualIndex].setEmergencyState();
        if (!isAnyPerpetualIn(liquidityPool, PerpetualState.NORMAL)) {
            refundDonatedInsuranceFund(liquidityPool);
        }
    }

    /**
     * @dev     @dev     Check if all the perpetuals in the liquidity pool are not in a state.
     */
    function isAnyPerpetualIn(LiquidityPoolStorage storage liquidityPool, PerpetualState state)
        internal
        view
        returns (bool)
    {
        uint256 length = liquidityPool.perpetualCount;
        for (uint256 i = 0; i < length; i++) {
            if (liquidityPool.perpetuals[i].state == state) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev     Check if all the perpetuals in the liquidity pool are not in normal state.
     */
    function isAllPerpetualIn(LiquidityPoolStorage storage liquidityPool, PerpetualState state)
        internal
        view
        returns (bool)
    {
        uint256 length = liquidityPool.perpetualCount;
        for (uint256 i = 0; i < length; i++) {
            if (liquidityPool.perpetuals[i].state != state) {
                return false;
            }
        }
        return true;
    }

    /**
     * @dev     Refund donated insurance fund to current operator.
     *           - If current operator address is non-zero, all the donated funds will be forward to the operator address;
     *           - If no operator, the donated funds will be dispatched to the LPs according to the ratio of owned shares.
     */
    function refundDonatedInsuranceFund(LiquidityPoolStorage storage liquidityPool) internal {
        address operator = liquidityPool.getOperator();
        if (liquidityPool.donatedInsuranceFund > 0 && operator != address(0)) {
            int256 toRefund = liquidityPool.donatedInsuranceFund;
            liquidityPool.donatedInsuranceFund = 0;
            liquidityPool.transferToUser(operator, toRefund);
        }
    }

    /**
     * @dev     Set the state of all the perpetuals to "EMERGENCY". Use special type of rebalance.
     *          After rebalance, pool cash >= 0 and margin / initialMargin is the same in all perpetuals.
     *          Can only called when AMM is not maintenance margin safe in all perpetuals.
     *          After that all the perpetuals are not allowed to trade, deposit and withdraw.
     *          The price of every perpetual is freezed to the settlement price
     * @param   liquidityPool   The reference of liquidity pool storage.
     */
    function setAllPerpetualsToEmergencyState(LiquidityPoolStorage storage liquidityPool) public {
        require(liquidityPool.perpetualCount > 0, "no perpetual to settle");
        int256 margin;
        int256 maintenanceMargin;
        int256 initialMargin;
        uint256 length = liquidityPool.perpetualCount;
        for (uint256 i = 0; i < length; i++) {
            PerpetualStorage storage perpetual = liquidityPool.perpetuals[i];
            if (perpetual.state != PerpetualState.NORMAL) {
                continue;
            }
            int256 markPrice = perpetual.getMarkPrice();
            maintenanceMargin = maintenanceMargin.add(
                perpetual.getMaintenanceMargin(address(this), markPrice)
            );
            initialMargin = initialMargin.add(perpetual.getInitialMargin(address(this), markPrice));
            margin = margin.add(perpetual.getMargin(address(this), markPrice));
        }
        margin = margin.add(liquidityPool.poolCash);
        require(
            margin < maintenanceMargin ||
                IPoolCreatorFull(liquidityPool.creator).isUniverseSettled(),
            "AMM's margin >= maintenance margin or not universe settled"
        );
        // rebalance for settle all perps
        // Floor to make sure poolCash >= 0
        int256 rate = initialMargin != 0 ? margin.wdiv(initialMargin, Round.FLOOR) : 0;
        for (uint256 i = 0; i < length; i++) {
            PerpetualStorage storage perpetual = liquidityPool.perpetuals[i];
            if (perpetual.state != PerpetualState.NORMAL) {
                continue;
            }
            int256 markPrice = perpetual.getMarkPrice();
            // Floor to make sure poolCash >= 0
            int256 newMargin = perpetual.getInitialMargin(address(this), markPrice).wmul(
                rate,
                Round.FLOOR
            );
            margin = perpetual.getMargin(address(this), markPrice);
            int256 deltaMargin = newMargin.sub(margin);
            if (deltaMargin > 0) {
                // from pool to perp
                perpetual.updateCash(address(this), deltaMargin);
                liquidityPool.transferFromPoolToPerpetual(i, deltaMargin);
            } else if (deltaMargin < 0) {
                // from perp to pool
                perpetual.updateCash(address(this), deltaMargin);
                liquidityPool.transferFromPerpetualToPool(i, deltaMargin.neg());
            }
            liquidityPool.perpetuals[i].setEmergencyState();
        }
        require(liquidityPool.poolCash >= 0, "negative poolCash after settle all");
        refundDonatedInsuranceFund(liquidityPool);
    }

    /**
     * @dev     Set the state of the perpetual to "CLEARED". Add the collateral of AMM in the perpetual to the pool cash.
     *          Can only called when all the active accounts in the perpetual are cleared
     * @param   liquidityPool   The reference of liquidity pool storage.
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool
     */
    function setClearedState(LiquidityPoolStorage storage liquidityPool, uint256 perpetualIndex)
        public
    {
        require(perpetualIndex < liquidityPool.perpetualCount, "perpetual index out of range");
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[perpetualIndex];
        perpetual.countMargin(address(this));
        perpetual.setClearedState();
        int256 marginToReturn = perpetual.settle(address(this));
        liquidityPool.transferFromPerpetualToPool(perpetualIndex, marginToReturn);
    }

    /**
     * @dev     Clear the next active account of the perpetual which state is "EMERGENCY" and send gas reward of collateral
     *          to sender. If all active accounts are cleared, the clear progress is done and the perpetual's state will
     *          change to "CLEARED". Active means the trader's account is not empty in the perpetual.
     *          Empty means cash and position are zero.
     *
     * @param   liquidityPool   The reference of liquidity pool storage.
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool
     */
    function clear(
        LiquidityPoolStorage storage liquidityPool,
        uint256 perpetualIndex,
        address trader
    ) public {
        PerpetualStorage storage perpetual = liquidityPool.perpetuals[perpetualIndex];
        if (
            perpetual.keeperGasReward > 0 && perpetual.totalCollateral >= perpetual.keeperGasReward
        ) {
            LiquidityPoolModule.transferFromPerpetualToUser(
                liquidityPool,
                perpetualIndex,
                trader,
                perpetual.keeperGasReward
            );
        }
        if (
            perpetual.activeAccounts.length() == 0 ||
            perpetual.clear(perpetual.getNextActiveAccount())
        ) {
            setClearedState(liquidityPool, perpetualIndex);
        }
    }
}
