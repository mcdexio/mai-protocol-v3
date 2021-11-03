// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";

import "./interface/IPerpetual.sol";

import "./libraries/Constant.sol";
import "./libraries/OrderData.sol";

import "./module/TradeModule.sol";
import "./module/OrderModule.sol";
import "./module/LiquidityPoolModule.sol";
import "./module/LiquidityPoolModule2.sol";

import "./Storage.sol";
import "./Type.sol";

contract Perpetual is Storage, ReentrancyGuardUpgradeable, IPerpetual {
    using OrderData for bytes;
    using OrderData for uint32;
    using OrderModule for LiquidityPoolStorage;
    using TradeModule for LiquidityPoolStorage;
    using LiquidityPoolModule for LiquidityPoolStorage;
    using LiquidityPoolModule2 for LiquidityPoolStorage;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    // deprecated
    function setTargetLeverage(
        uint256 perpetualIndex,
        address trader,
        int256 targetLeverage
    )
        external
        onlyAuthorized(
            trader,
            Constant.PRIVILEGE_TRADE | Constant.PRIVILEGE_DEPOSIT | Constant.PRIVILEGE_WITHDRAW
        )
    {
        require(trader != address(0), "invalid trader");
        require(targetLeverage % Constant.SIGNED_ONE == 0, "targetLeverage must be integer");
        require(targetLeverage > 0, "targetLeverage is negative");
        _liquidityPool.setTargetLeverage(perpetualIndex, trader, targetLeverage);
    }

    /**
     * @notice  Deposit collateral to the perpetual.
     *          Can only called when the perpetual's state is "NORMAL".
     *          This method will always increase `cash` amount in trader's margin account.
     *
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool.
     * @param   trader          The address of the trader.
     * @param   amount          The amount of collateral to deposit. The amount always use decimals 18.
     */
    function deposit(
        uint256 perpetualIndex,
        address trader,
        int256 amount
    )
        external
        override
        nonReentrant
        onlyNotUniverseSettled
        onlyAuthorized(trader, Constant.PRIVILEGE_DEPOSIT)
    {
        require(
            _liquidityPool.perpetuals[perpetualIndex].state == PerpetualState.NORMAL,
            "perpetual should be in NORMAL state"
        );
        require(trader != address(0), "invalid trader");
        require(amount > 0, "invalid amount");
        _liquidityPool.deposit(perpetualIndex, trader, amount);
    }

    /**
     * @notice  Withdraw collateral from the trader's account of the perpetual.
     *          After withdrawn, trader shall at least has maintenance margin left in account.
     *          Can only called when the perpetual's state is "NORMAL".
     *          Margin account must at least keep
     *          The trader's cash will decrease in the perpetual.
     *          Need to update the funding state and the oracle price of each perpetual before
     *          and update the funding rate of each perpetual after
     *
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool.
     * @param   trader          The address of the trader.
     * @param   amount          The amount of collateral to withdraw. The amount always use decimals 18.
     */
    function withdraw(
        uint256 perpetualIndex,
        address trader,
        int256 amount
    )
        external
        override
        nonReentrant
        onlyNotUniverseSettled
        syncState(false)
        onlyAuthorized(trader, Constant.PRIVILEGE_WITHDRAW)
    {
        require(
            _liquidityPool.perpetuals[perpetualIndex].state == PerpetualState.NORMAL,
            "perpetual should be in NORMAL state"
        );
        require(trader != address(0), "invalid trader");
        require(amount > 0, "invalid amount");
        _liquidityPool.withdraw(perpetualIndex, trader, amount);
    }

    /**
     * @notice  If the state of the perpetual is "CLEARED", anyone authorized withdraw privilege by trader can settle
     *          trader's account in the perpetual. Which means to calculate how much the collateral should be returned
     *          to the trader, return it to trader's wallet and clear the trader's cash and position in the perpetual.
     *
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool
     * @param   trader          The address of the trader.
     */
    function settle(uint256 perpetualIndex, address trader)
        external
        override
        onlyAuthorized(trader, Constant.PRIVILEGE_WITHDRAW)
        nonReentrant
    {
        require(trader != address(0), "invalid trader");
        require(
            _liquidityPool.perpetuals[perpetualIndex].state == PerpetualState.CLEARED,
            "perpetual should be in CLEARED state"
        );
        _liquidityPool.settle(perpetualIndex, trader);
    }

    /**
     * @notice  Clear the next active account of the perpetual which state is "EMERGENCY" and send gas reward of collateral
     *          to sender. If all active accounts are cleared, the clear progress is done and the perpetual's state will
     *          change to "CLEARED". Active means the trader's account is not empty in the perpetual.
     *          Empty means cash and position are zero
     *
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool.
     */
    function clear(uint256 perpetualIndex) external override nonReentrant {
        require(
            _liquidityPool.perpetuals[perpetualIndex].state == PerpetualState.EMERGENCY,
            "perpetual should be in EMERGENCY state"
        );
        _liquidityPool.clear(perpetualIndex, _msgSender());
    }

    /**
     * @notice  Trade with AMM in the perpetual, require sender is granted the trade privilege by the trader.
     *          The trading price is determined by the AMM based on the index price of the perpetual.
     *          A successful trade should:
     *            - The trade transaction not exceeds deadline;
     *            - Current liquidity of amm is enough to make the deal;
     *            - to open position:
     *              - Trader's margin balance must be greater then or equal to initial margin after trading;
     *              - Full trading fee will be charged if trader is opening position.
     *            - to close position:
     *              - Trader's margin balance must be greater then or equal to 0 after trading;
     *              - Trader need to pay the trading fee as much as possible before all the margin balance drained.
     *          If one trade transaction does close and open at same time (Open positions in the opposite direction)
     *          It will be treat as opening position.
     *
     *
     *          Flags is a 32 bit uint value which indicates: (from highest bit)
     *            31               27 26                     7 6              0
     *           +---+---+---+---+---+------------------------+----------------+
     *           | C | M | S | T | R | Target leverage 20bits | Reserved 7bits |
     *           +---+---+---+---+---+------------------------+----------------+
     *             |   |   |   |   |   ` Target leverage  Fixed-point decimal with 2 decimal digits. 
     *             |   |   |   |   |                      0 means don't automatically deposit / withdraw.
     *             |   |   |   |   `---  Reserved
     *             |   |   |   `-------  Take profit      Only available in brokerTrade mode.
     *             |   |   `-----------  Stop loss        Only available in brokerTrade mode.
     *             |   `---------------  Market order     Do not check limit price during trading.
     *             `-------------------  Close only       Only close position during trading.
     *          For stop loss and take profit, see `validateTriggerPrice` in OrderModule.sol for details.
     *
     * @param   perpetualIndex  The index of the perpetual in liquidity pool.
     * @param   trader          The address of trader.
     * @param   amount          The amount of position to trader, positive for buying and negative for selling. The amount always use decimals 18.
     * @param   limitPrice      The worst price the trader accepts.
     * @param   deadline        The deadline of trade transaction.
     * @param   referrer        The address of referrer who will get rebate from the deal.
     * @param   flags           The flags of the trade.
     * @return  tradeAmount     The amount of positions actually traded in the transaction. The amount always use decimals 18.
     */
    function trade(
        uint256 perpetualIndex,
        address trader,
        int256 amount,
        int256 limitPrice,
        uint256 deadline,
        address referrer,
        uint32 flags
    )
        external
        override
        onlyAuthorized(
            trader,
            flags.useTargetLeverage()
                ? Constant.PRIVILEGE_TRADE |
                    Constant.PRIVILEGE_DEPOSIT |
                    Constant.PRIVILEGE_WITHDRAW
                : Constant.PRIVILEGE_TRADE
        )
        syncState(false)
        returns (int256 tradeAmount)
    {
        require(trader != address(0), "invalid trader");
        require(amount != 0, "invalid amount");
        require(deadline >= block.timestamp, "deadline exceeded");
        tradeAmount = _trade(perpetualIndex, trader, amount, limitPrice, referrer, flags);
    }

    /**
     * @notice  Trade with AMM by the order, initiated by the broker. order is passed in through packed data structure.
     *          All the fields of order are verified by signature.
     *          See `trade` for details.
     * @param   orderData   The order data object
     * @param   amount      The amount of position to trader, positive for buying and negative for selling.
     *                      This amount should be lower then or equal to amount in `orderData`. The amount always use decimals 18.
     * @return  tradeAmount The amount of positions actually traded in the transaction. The amount always use decimals 18.
     */
    function brokerTrade(bytes memory orderData, int256 amount)
        external
        override
        syncState(false)
        returns (int256 tradeAmount)
    {
        Order memory order = orderData.decodeOrderData();
        bytes memory signature = orderData.decodeSignature();
        _liquidityPool.validateSignature(order, signature);
        _liquidityPool.validateOrder(order, amount);
        _liquidityPool.validateTriggerPrice(order);
        tradeAmount = _trade(
            order.perpetualIndex,
            order.trader,
            amount,
            order.limitPrice,
            order.referrer,
            order.flags
        );
    }

    /**
     * @notice  Liquidate the trader if the trader's margin balance is lower than maintenance margin (unsafe).
     *          Liquidate can be considered as a forced trading between AMM and unsafe margin account;
     *          Based on current liquidity of AMM, it may take positions up to an amount equal to all the position
     *          of the unsafe account. Besides the position, trader need to pay an extra penalty to AMM
     *          for taking the unsafe assets. See TradeModule.sol for ehe strategy of penalty.
     *
     *          The liquidate price will be determined by AMM.
     *          Caller of this method can be anyone, then get a reward to make up for transaction gas fee.
     *
     *          If a trader's margin balance is lower than 0 (bankrupt), insurance fund will be use to fill the loss
     *          to make the total profit and loss balanced. (first the `insuranceFund` then the `donatedInsuranceFund`)
     *
     *          If insurance funds are drained, the state of perpetual will turn to enter "EMERGENCY" than shutdown.
     *          Can only liquidate when the perpetual's state is "NORMAL".
     *
     * @param   perpetualIndex      The index of the perpetual in liquidity pool
     * @param   trader              The address of trader to be liquidated.
     * @return  liquidationAmount   The amount of positions actually liquidated in the transaction. The amount always use decimals 18.
     */
    function liquidateByAMM(uint256 perpetualIndex, address trader)
        external
        override
        nonReentrant
        onlyNotUniverseSettled
        syncState(false)
        returns (int256 liquidationAmount)
    {
        require(_isAMMKeeper(perpetualIndex, _msgSender()), "caller must be keeper");
        require(
            _liquidityPool.perpetuals[perpetualIndex].state == PerpetualState.NORMAL,
            "perpetual should be in NORMAL state"
        );
        require(trader != address(0), "invalid trader");
        require(trader != address(this), "cannot liquidate AMM");
        liquidationAmount = _liquidityPool.liquidateByAMM(perpetualIndex, _msgSender(), trader);
    }

    /**
     * @notice  This method is generally consistent with `liquidateByAMM` function, but there some difference:
     *           - The liquidation price is no longer determined by AMM, but the mark price;
     *           - The penalty is taken by trader who takes position but AMM;
     *
     * @param   perpetualIndex      The index of the perpetual in liquidity pool.
     * @param   liquidator          The address of liquidator to receive the liquidated position.
     * @param   trader              The address of trader to be liquidated.
     * @param   amount              The amount of position to be taken from liquidated trader. The amount always use decimals 18.
     * @param   limitPrice          The worst price liquidator accepts.
     * @param   deadline            The deadline of transaction.
     * @return  liquidationAmount   The amount of positions actually liquidated in the transaction.
     */
    function liquidateByTrader(
        uint256 perpetualIndex,
        address liquidator,
        address trader,
        int256 amount,
        int256 limitPrice,
        uint256 deadline
    )
        external
        override
        nonReentrant
        onlyNotUniverseSettled
        onlyAuthorized(liquidator, Constant.PRIVILEGE_LIQUIDATE)
        syncState(false)
        returns (int256 liquidationAmount)
    {
        require(
            _liquidityPool.perpetuals[perpetualIndex].state == PerpetualState.NORMAL,
            "perpetual should be in NORMAL state"
        );
        require(trader != address(0), "invalid trader");
        require(trader != address(this), "cannot liquidate AMM");
        require(amount != 0, "invalid amount");
        require(limitPrice >= 0, "invalid limit price");
        require(deadline >= block.timestamp, "deadline exceeded");
        liquidationAmount = _liquidityPool.liquidateByTrader(
            perpetualIndex,
            liquidator,
            trader,
            amount,
            limitPrice
        );
    }

    function _trade(
        uint256 perpetualIndex,
        address trader,
        int256 amount,
        int256 limitPrice,
        address referrer,
        uint32 flags
    ) internal onlyNotUniverseSettled returns (int256 tradeAmount) {
        require(
            _liquidityPool.perpetuals[perpetualIndex].state == PerpetualState.NORMAL,
            "perpetual should be in NORMAL state"
        );
        tradeAmount = _liquidityPool.trade(
            perpetualIndex,
            trader,
            amount,
            limitPrice,
            referrer,
            flags
        );
    }

    function _isAMMKeeper(uint256 perpetualIndex, address liquidator) internal view returns (bool) {
        EnumerableSetUpgradeable.AddressSet storage whitelist = _liquidityPool
            .perpetuals[perpetualIndex]
            .ammKeepers;
        if (whitelist.length() == 0) {
            return IPoolCreatorFull(_liquidityPool.creator).isKeeper(liquidator);
        } else {
            return whitelist.contains(liquidator);
        }
    }

    bytes32[50] private __gap;
}
