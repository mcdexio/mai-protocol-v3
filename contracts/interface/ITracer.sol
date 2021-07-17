// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.4;

import "./IProxyAdmin.sol";

interface ITracer {
    /**
     * @notice  Activate the perpetual for the trader. Active means the trader's account is not empty in
     *          the perpetual. Empty means cash and position are zero. Can only called by a liquidity pool.
     *
     * @param   trader          The address of the trader.
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool.
     * @return  True if the activation is successful.
     */
    function activatePerpetualFor(address trader, uint256 perpetualIndex) external returns (bool);

    /**
     * @notice  Deactivate the perpetual for the trader. Active means the trader's account is not empty in
     *          the perpetual. Empty means cash and position are zero. Can only called by a liquidity pool.
     *
     * @param   trader          The address of the trader.
     * @param   perpetualIndex  The index of the perpetual in the liquidity pool.
     * @return  True if the deactivation is successful.
     */
    function deactivatePerpetualFor(address trader, uint256 perpetualIndex) external returns (bool);

    /**
     * @notice  Liquidity pool must call this method when changing its ownership to the new operator.
     *          Can only be called by a liquidity pool. This method does not affect 'ownership' or privileges
     *          of operator but only make a record for further query.
     *
     * @param   liquidityPool   The address of the liquidity pool.
     * @param   operator        The address of the new operator, must be different from the old operator.
     */
    function registerOperatorOfLiquidityPool(address liquidityPool, address operator) external;

    /**
     * @notice  Check if the liquidity pool exists.
     *
     * @param   liquidityPool   The address of the liquidity pool.
     * @return  True if the liquidity pool exists.
     */
    function isLiquidityPool(address liquidityPool) external view returns (bool);
}
