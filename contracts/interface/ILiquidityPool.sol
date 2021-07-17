// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "../Type.sol";

interface ILiquidityPool {
    /**
     * @notice Initialize the liquidity pool and set up its configuration.
     *
     * @param operator              The operator's address of the liquidity pool.
     * @param collateral            The collateral's address of the liquidity pool.
     * @param collateralDecimals    The collateral's decimals of the liquidity pool.
     * @param governor              The governor's address of the liquidity pool.
     * @param initData              A bytes array contains data to initialize new created liquidity pool.
     */
    function initialize(
        address operator,
        address collateral,
        uint256 collateralDecimals,
        address governor,
        bytes calldata initData
    ) external;

    /**
     * @dev     Upgrade LiquidityPool. Call this function after initialize()
     *
     * @param   nextAddresses          Implementations except the 1st one of ChainedProxy
     */
    function upgradeChainedProxy(address[] memory nextAddresses) external;

    /**
     * @notice  If you want to get the real-time data, call this function first
     */
    function forceToSyncState() external;

    /**
     * @notice  Add liquidity to the liquidity pool.
     *          Liquidity provider deposits collaterals then gets share tokens back.
     *          The ratio of added cash to share token is determined by current liquidity.
     *          Can only called when the pool is running.
     *
     * @param   cashToAdd   The amount of cash to add. always use decimals 18.
     */
    function addLiquidity(int256 cashToAdd) external;

    /**
     * @notice  Remove liquidity from the liquidity pool.
     *          Liquidity providers redeems share token then gets collateral back.
     *          The amount of collateral retrieved may differ from the amount when adding liquidity,
     *          The index price, trading fee and positions holding by amm will affect the profitability of providers.
     *          Can only called when the pool is running.
     *
     * @param   shareToRemove   The amount of share token to remove. The amount always use decimals 18.
     * @param   cashToReturn    The amount of cash(collateral) to return. The amount always use decimals 18.
     */
    function removeLiquidity(int256 shareToRemove, int256 cashToReturn) external;
}
