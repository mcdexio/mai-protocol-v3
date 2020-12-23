// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/Address.sol";

import "../interface/IGovernor.sol";
import "../interface/ILiquidityPool.sol";
import "../interface/IShareToken.sol";

import "./Tracer.sol";
import "./Implementation.sol";
import "./Variables.sol";
import "./AccessControl.sol";
import "./ProxyCreator.sol";

import "hardhat/console.sol";

contract PoolCreator is ProxyCreator, Tracer, Implementation, Variables, AccessControl {
    using Address for address;

    address internal _governorTemplate;
    address internal _shareTokenTemplate;

    constructor(
        address governorTemplate,
        address shareTokenTemplate,
        address wethToken,
        address symbolService,
        address globalVault,
        int256 globalVaultFeeRate
    ) Variables(wethToken, symbolService, globalVault, globalVaultFeeRate) Implementation() {
        require(governorTemplate.isContract(), "governor template must be contract");
        require(shareTokenTemplate.isContract(), "share token template must be contract");
        _governorTemplate = governorTemplate;
        _shareTokenTemplate = shareTokenTemplate;
    }

    event CreateLiquidityPool(
        address liquidityPool,
        address governor,
        address shareToken,
        address operator,
        address collateral,
        int256 insuranceFundCap
    );

    function createLiquidityPool(
        address collateral,
        int256 insuranceFundCap,
        int256 nonce
    ) external returns (address) {
        return _createLiquidityPoolWith(getLatestVersion(), collateral, insuranceFundCap, nonce);
    }

    function createLiquidityPoolWith(
        address implementation,
        address collateral,
        int256 insuranceFundCap,
        int256 nonce
    ) external returns (address) {
        return _createLiquidityPoolWith(implementation, collateral, insuranceFundCap, nonce);
    }

    function _createLiquidityPoolWith(
        address implementation,
        address collateral,
        int256 insuranceFundCap,
        int256 nonce
    ) internal returns (address) {
        require(isVersionValid(implementation), "invalid implementation");
        address governor = _createClone(_governorTemplate);
        address shareToken = _createClone(_shareTokenTemplate);
        address liquidityPool = _createUpgradeableProxy(implementation, governor, nonce);
        // initialize
        address operator = msg.sender;
        IShareToken(shareToken).initialize("MCDEX Share Token", "STK", liquidityPool);
        IGovernor(governor).initialize(shareToken, liquidityPool);
        ILiquidityPool(liquidityPool).initialize(
            operator,
            collateral,
            governor,
            shareToken,
            insuranceFundCap
        );
        // register
        _registerLiquidityPool(liquidityPool, operator);
        emit CreateLiquidityPool(
            liquidityPool,
            governor,
            shareToken,
            operator,
            collateral,
            insuranceFundCap
        );
        return liquidityPool;
    }
}
