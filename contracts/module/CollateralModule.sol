// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";

import "../interface/IFactory.sol";
import "../interface/IWETH.sol";

import "../Type.sol";

/**
 * @title   Collateral Module
 * @dev     Handle underlying collaterals.
 *          In this file, parameter named with:
 *              - [amount] means internal amount
 *              - [rawAmount] means amount in decimals of underlying collateral
 *
 */
library CollateralModule {
    using SafeMathUpgradeable for uint256;
    using SafeCastUpgradeable for int256;
    using SafeCastUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // /**
    //  * @dev     Initialize collateral and decimals.
    //  * @param   collateral   Address of collateral, 0x0 if using ether.
    //  */

    /**
     * @dev     Get collateral balance in account.
     * @param   account     Address of account.
     * @return  Raw repesentation of collateral balance.
     */
    function collateralBalance(Core storage core, address account) internal view returns (int256) {
        return IERC20Upgradeable(core.collateral).balanceOf(account).toInt256();
    }

    /**
     * @dev     Transfer token from user if token is erc20 token.
     * @param   account     Address of account owner.
     * @param   amount   Amount of token to be transferred into contract.
     */
    function transferFromUser(
        Core storage core,
        address account,
        int256 amount,
        uint256 value
    ) public {
        uint256 rawAmount = _toRawAmount(core, amount.toUint256());
        if (core.isWrapped && value > 0) {
            IWETH(IFactory(core.factory).weth()).deposit();
        }
        IERC20Upgradeable(core.collateral).safeTransferFrom(account, address(this), rawAmount);
    }

    /**
     * @dev     Transfer token to user no matter erc20 token or ether.
     * @param   account     Address of account owner.
     * @param   amount   Amount of token to be transferred to user.
     */
    function transferToUser(
        Core storage core,
        address payable account,
        int256 amount
    ) public {
        uint256 rawAmount = _toRawAmount(core, amount.toUint256());
        if (core.isWrapped) {
            IWETH(IFactory(core.factory).weth()).withdraw(rawAmount);
            AddressUpgradeable.sendValue(account, rawAmount);
        } else {
            IERC20Upgradeable(core.collateral).safeTransfer(account, rawAmount);
        }
    }

    /**
     * @dev     Convert the represention of amount from internal to raw.
     * @param   amount  Amount with internal decimals.
     * @return  Amount  with decimals of token.
     */
    function _toRawAmount(Core storage core, uint256 amount) private view returns (uint256) {
        return amount.div(core.scaler);
    }
}
