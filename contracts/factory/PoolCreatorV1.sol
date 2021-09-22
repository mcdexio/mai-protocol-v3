// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/proxy/ProxyAdmin.sol";

import "../interface/IProxyAdmin.sol";
import "../interface/IPoolCreator.sol";

import "./Tracer.sol";
import "./VersionControl.sol";
import "./Variables.sol";
import "./AccessControl.sol";
import "../module/PoolCreatorModule.sol";

abstract contract PoolCreatorV1 is
    Initializable,
    Tracer,
    VersionControl,
    Variables,
    AccessControl,
    IPoolCreator
{
    using AddressUpgradeable for address;

    IProxyAdmin public override upgradeAdmin;

    event CreateLiquidityPool(
        bytes32 versionKey,
        address indexed liquidityPool,
        address indexed governor,
        address indexed operator,
        address shareToken, //  downward compatibility for offline infrastructure
        address collateral,
        uint256 collateralDecimals,
        bytes initData
    );
    event UpgradeLiquidityPool(
        bytes32 versionKey,
        address indexed liquidityPool,
        address indexed governor
    );

    function initialize(
        address symbolService,
        address globalVault,
        int256 globalVaultFeeRate
    ) external initializer {
        __Ownable_init();
        __Variables_init(symbolService, globalVault, globalVaultFeeRate);

        upgradeAdmin = IProxyAdmin(address(new ProxyAdmin()));
    }

    /**
     * @notice Owner of version control.
     */
    function owner() public view virtual override(VersionControl, Variables) returns (address) {
        return OwnableUpgradeable.owner();
    }

    /**
     * @notice  Create a liquidity pool with the latest version.
     *          The sender will be the operator of pool.
     *
     * @param   collateral              he collateral address of the liquidity pool.
     * @param   collateralDecimals      The collateral's decimals of the liquidity pool.
     * @param   nonce                   A random nonce to calculate the address of deployed contracts.
     * @param   initData                A bytes array contains data to initialize new created liquidity pool.
     * @return  liquidityPool           The address of the created liquidity pool.
     */
    function createLiquidityPool(
        address collateral,
        uint256 collateralDecimals,
        int256 nonce,
        bytes calldata initData
    ) external override returns (address liquidityPool, address governor) {
        address operator = _msgSender();
        bytes32 versionKey = getLatestVersion();
        (liquidityPool, governor) = PoolCreatorModule.createLiquidityPoolWith(
            address(this),
            operator,
            versionKey,
            collateral,
            collateralDecimals,
            nonce,
            initData
        );
        // register pool to tracer
        _registerLiquidityPool(liquidityPool, operator);
        _updateDeployedInstances(versionKey, liquidityPool, governor);
    }

    /**
     * @notice  Upgrade a liquidity pool and governor pair then call a patch function on the upgraded contract (optional).
     *          This method checks the sender and forwards the request to ProxyAdmin to do upgrading.
     *
     * @param   targetVersionKey        The key of version to be upgrade up. The target version must be compatiable with
     *                                  current version.
     * @param   dataForLiquidityPool    The patch calldata for upgraded liquidity pool.
     * @param   dataForGovernor         The patch calldata of upgraded governor.
     */
    function upgradeToAndCall(
        bytes32 targetVersionKey,
        bytes memory dataForLiquidityPool,
        bytes memory dataForGovernor
    ) external override {
        address governor = _msgSender();
        address liquidityPool = PoolCreatorModule.upgradeToAndCall(
            address(this),
            governor,
            targetVersionKey,
            dataForLiquidityPool,
            dataForGovernor
        );
        _updateDeployedInstances(targetVersionKey, liquidityPool, governor);
    }
}
