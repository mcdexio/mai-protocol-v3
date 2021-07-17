// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/utils/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import "./interface/ILiquidityPool.sol";

import "./module/AMMModule.sol";
import "./module/LiquidityPoolModule.sol";
import "./module/LiquidityPoolModule2.sol";
import "./module/PerpetualModule.sol";

import "./Getter.sol";
import "./Governance.sol";
import "./Storage.sol";
import "./Type.sol";

contract LiquidityPoolHop1 is Storage, ReentrancyGuardUpgradeable, Getter, Governance {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.Bytes32Set;
    using SafeCastUpgradeable for uint256;
    using PerpetualModule for PerpetualStorage;
    using LiquidityPoolModule for LiquidityPoolStorage;
    using LiquidityPoolModule2 for LiquidityPoolStorage;
    using AMMModule for LiquidityPoolStorage;

    /**
     * @notice  Set the liquidity pool to running state. Can be call only once by operater.m n
     */
    function runLiquidityPool() external onlyOperator {
        require(!_liquidityPool.isRunning, "already running");
        _liquidityPool.runLiquidityPool();
    }

    /**
     * @notice  Donate collateral to the insurance fund of the pool.
     *          Can only called when the pool is running.
     *          Donated collateral is not withdrawable but can be used to improve security.
     *          Unexpected loss (bankrupt) will be deducted from insurance fund then donated insurance fund.
     *          Until donated insurance fund is drained, the perpetual will not enter emergency state and shutdown.
     *
     * @param   amount          The amount of collateral to donate. The amount always use decimals 18.
     */
    function donateInsuranceFund(int256 amount) external nonReentrant {
        require(_liquidityPool.isRunning, "pool is not running");
        _liquidityPool.donateInsuranceFund(_msgSender(), amount);
    }

    /**
     * @notice  Add liquidity to the liquidity pool without getting shares.
     *
     * @param   cashToAdd   The amount of cash to add. The amount always use decimals 18.
     */
    function donateLiquidity(int256 cashToAdd) external nonReentrant {
        require(_liquidityPool.isRunning, "pool is not running");
        _liquidityPool.donateLiquidity(_msgSender(), cashToAdd);
    }

    bytes32[50] private __gap;
}
