// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.4;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/proxy/ProxyAdmin.sol";

import "../interface/IGovernor.sol";
import "../interface/ILiquidityPool.sol";
import "../interface/IProxyAdmin.sol";
import "../interface/IPoolCreatorFull.sol";

import "../factory/Variables.sol";
import "../factory/VersionControl.sol";
import "../factory/Tracer.sol";

library PoolCreatorModule {
    using AddressUpgradeable for address;

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
        address poolCreator,
        address governor,
        bytes32 targetVersionKey,
        bytes memory dataForLiquidityPool,
        bytes memory dataForGovernor
    ) external returns (address) {
        (
            address liquidityPool,
            address[] memory liquidityPoolTemplate,
            address governorTemplate
        ) = _getUpgradeContext(poolCreator, governor, targetVersionKey);
        address hop0 = _upgradeLiquidityPoolChainedProxy(liquidityPool, liquidityPoolTemplate);
        IProxyAdmin upgradeAdmin = IPoolCreator(poolCreator).upgradeAdmin();
        if (dataForLiquidityPool.length > 0) {
            upgradeAdmin.upgradeAndCall(liquidityPool, hop0, dataForLiquidityPool);
        } else {
            upgradeAdmin.upgrade(liquidityPool, hop0);
        }
        if (dataForGovernor.length > 0) {
            upgradeAdmin.upgradeAndCall(governor, governorTemplate, dataForGovernor);
        } else {
            upgradeAdmin.upgrade(governor, governorTemplate);
        }

        emit UpgradeLiquidityPool(targetVersionKey, liquidityPool, governor);
        return liquidityPool;
    }

    /**
     * @dev     Create a liquidity pool with the specific version. The operator will be the sender.
     *
     * @param   versionKey          The address of version
     * @param   collateral          The collateral address of the liquidity pool.
     * @param   collateralDecimals  The collateral's decimals of the liquidity pool.
     * @param   nonce               A random nonce to calculate the address of deployed contracts.
     * @param   initData            A bytes array contains data to initialize new created liquidity pool.
     * @return  liquidityPool       The address of the created liquidity pool.
     * @return  governor            The address of the created governor.
     */
    function createLiquidityPoolWith(
        address poolCreator,
        address operator,
        bytes32 versionKey,
        address mcbToken,
        address collateral,
        uint256 collateralDecimals,
        int256 nonce,
        bytes memory initData
    ) public returns (address liquidityPool, address governor) {
        // initialize
        require(VersionControl(poolCreator).isVersionKeyValid(versionKey), "invalid version");
        (address[] memory liquidityPoolTemplate, address governorTemplate, ) = VersionControl(
            poolCreator
        ).getVersion(versionKey);
        bytes32 salt = keccak256(abi.encode(versionKey, collateral, initData, nonce));

        address upgradeAdmin = address(IPoolCreator(poolCreator).upgradeAdmin());
        liquidityPool = _createUpgradeableProxy(upgradeAdmin, liquidityPoolTemplate[0], salt);
        governor = _createUpgradeableProxy(upgradeAdmin, governorTemplate, salt);

        ILiquidityPool(liquidityPool).initialize(
            operator,
            collateral,
            collateralDecimals,
            governor,
            initData
        );
        _upgradeLiquidityPoolChainedProxy(liquidityPool, liquidityPoolTemplate);
        IGovernor(governor).initialize(
            "MCDEX Share Token",
            "STK",
            liquidityPool,
            liquidityPool,
            mcbToken,
            address(this)
        );
        // [EVENT UPDATE]
        emit CreateLiquidityPool(
            versionKey,
            liquidityPool,
            governor,
            operator,
            governor,
            collateral,
            collateralDecimals,
            initData
        );
    }

    /**
     * @dev     Create an upgradeable proxy contract of the implementation of liquidity pool.
     *
     * @param   implementation The address of the implementation.
     * @param   salt        The random number for create2.
     * @return  instance    The address of the created upgradeable proxy contract.
     */
    function _createUpgradeableProxy(
        address upgradeAdmin,
        address implementation,
        bytes32 salt
    ) internal returns (address instance) {
        require(implementation.isContract(), "implementation must be contract");
        bytes memory deploymentData = abi.encodePacked(
            type(TransparentUpgradeableProxy).creationCode,
            abi.encode(implementation, upgradeAdmin, "")
        );
        assembly {
            instance := create2(0x0, add(0x20, deploymentData), mload(deploymentData), salt)
        }
        require(instance != address(0), "create2 call failed");
    }

    function _upgradeLiquidityPoolChainedProxy(
        address liquidityPool,
        address[] memory liquidityPoolTemplate
    ) internal returns (address hop0) {
        require(liquidityPoolTemplate.length >= 1, "empty liquidityPoolTemplate");
        hop0 = liquidityPoolTemplate[0];

        // liquidityPool.nextHop = liquidityPool.implementations[1:]
        for (uint256 i = 0; i < liquidityPoolTemplate.length - 1; i++) {
            liquidityPoolTemplate[i] = liquidityPoolTemplate[i + 1];
        }
        assembly {
            mstore(liquidityPoolTemplate, sub(mload(liquidityPoolTemplate), 1))
        }
        ILiquidityPool(liquidityPool).upgradeChainedProxy(liquidityPoolTemplate);
    }

    /**
     * @dev Validate sender:
     *      - the transaction must be sent from a governor.
     *      - the sender governor and its liquidity pool must be already registered.
     *      - the target version must be compatible with the current version.
     */
    function _getUpgradeContext(
        address poolCreator,
        address governor,
        bytes32 targetVersionKey
    )
        internal
        view
        returns (
            address liquidityPool,
            address[] memory liquidityPoolTemplate,
            address governorTemplate
        )
    {
        require(governor.isContract(), "sender must be a contract");
        liquidityPool = IGovernor(governor).getTarget();
        require(
            IPoolCreatorFull(poolCreator).isLiquidityPool(liquidityPool),
            "sender is not the governor of a registered pool"
        );
        bytes32 baseVersionKey = VersionControl(poolCreator).getAppliedVersionKey(
            liquidityPool,
            governor
        );
        require(
            VersionControl(poolCreator).isVersionCompatible(targetVersionKey, baseVersionKey),
            "the target version is not compatible"
        );
        (liquidityPoolTemplate, governorTemplate, ) = VersionControl(poolCreator).getVersion(
            targetVersionKey
        );
    }
}
